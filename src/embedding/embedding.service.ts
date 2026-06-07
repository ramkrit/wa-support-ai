/**
 * EmbeddingService — wa-support-ai
 *
 * Generates vector embeddings from text using OpenAI's embedding API
 * via LangChain. Supports:
 * - Embedding a single text string (for queries)
 * - Embedding multiple texts in batch (for document ingestion)
 * - Embedding all un-embedded chunks stored in MongoDB
 *
 * @author ramkrit
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OpenAIEmbeddings } from '@langchain/openai';
import { DocumentChunk, DocumentChunkDocument } from '../database/schemas/document-chunk.schema';

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private embeddings: OpenAIEmbeddings;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(DocumentChunk.name)
    private readonly chunkModel: Model<DocumentChunkDocument>,
  ) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const model = this.configService.get<string>('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-small';

    if (!apiKey) {
      this.logger.error('[wa-support-ai] OPENAI_API_KEY not set — embedding module disabled');
      return;
    }

    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      modelName: model,
    });

    this.logger.log(`[wa-support-ai] Embedding service initialized with model: ${model}`);
  }

  /**
   * Embeds a single text string and returns the vector.
   * Use this for query-time embedding (user questions).
   */
  async embedText(text: string): Promise<number[]> {
    if (!this.embeddings) {
      throw new Error('[wa-support-ai] Embedding service not initialized');
    }

    this.logger.debug(`[wa-support-ai] Embedding text (${text.length} chars)`);
    return this.embeddings.embedQuery(text);
  }

  /**
   * Embeds multiple texts in a single batch request.
   * More efficient than calling embedText() in a loop.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.embeddings) {
      throw new Error('[wa-support-ai] Embedding service not initialized');
    }

    this.logger.debug(`[wa-support-ai] Embedding batch of ${texts.length} texts`);
    return this.embeddings.embedDocuments(texts);
  }

  /**
   * Finds all chunks in MongoDB that don't have embeddings yet
   * and generates + stores their vectors.
   *
   * Call this after document ingestion or as a background job.
   */
  async embedUnprocessedChunks(): Promise<{ processed: number; skipped: number }> {
    if (!this.embeddings) {
      throw new Error('[wa-support-ai] Embedding service not initialized');
    }

    // Find chunks with empty embedding arrays
    const chunks = await this.chunkModel
      .find({ $or: [{ embedding: { $size: 0 } }, { embedding: { $exists: false } }] })
      .exec();

    if (chunks.length === 0) {
      this.logger.debug('[wa-support-ai] No unprocessed chunks found');
      return { processed: 0, skipped: 0 };
    }

    this.logger.log(`[wa-support-ai] Embedding ${chunks.length} unprocessed chunks...`);

    // Process in batches of 100 to avoid rate limits
    const batchSize = 100;
    let processed = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map((chunk) => chunk.content);

      const vectors = await this.embedBatch(texts);

      // Update each chunk with its embedding
      const bulkOps = batch.map((chunk, idx) => ({
        updateOne: {
          filter: { _id: chunk._id },
          update: { $set: { embedding: vectors[idx] } },
        },
      }));

      await this.chunkModel.bulkWrite(bulkOps);
      processed += batch.length;

      this.logger.debug(
        `[wa-support-ai] Embedded batch ${Math.floor(i / batchSize) + 1} (${processed}/${chunks.length})`,
      );
    }

    this.logger.log(`[wa-support-ai] Embedding complete — ${processed} chunks processed`);

    return { processed, skipped: 0 };
  }

  /**
   * Embeds a single chunk by its MongoDB _id and stores the vector.
   */
  async embedChunkById(chunkId: string): Promise<void> {
    const chunk = await this.chunkModel.findById(chunkId).exec();
    if (!chunk) {
      throw new Error(`[wa-support-ai] Chunk ${chunkId} not found`);
    }

    const vector = await this.embedText(chunk.content);
    await this.chunkModel.updateOne({ _id: chunkId }, { $set: { embedding: vector } }).exec();

    this.logger.debug(`[wa-support-ai] Embedded chunk ${chunkId}`);
  }

  /**
   * Returns the embedding dimension for the configured model.
   * Useful for creating vector indexes.
   */
  get dimensions(): number {
    // text-embedding-3-small = 1536, text-embedding-3-large = 3072
    const model = this.configService.get<string>('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-small';
    return model.includes('large') ? 3072 : 1536;
  }
}
