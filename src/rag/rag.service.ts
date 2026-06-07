/**
 * RagService — wa-support-ai
 *
 * Orchestrates the full RAG pipeline:
 * 1. Embed the user query
 * 2. Search MongoDB for similar document chunks (vector search)
 * 3. Build an augmented prompt with retrieved context
 * 4. Call the LLM to generate an answer
 *
 * Uses MongoDB Atlas Vector Search ($vectorSearch aggregation)
 * for native similarity search — no external vector DB needed.
 *
 * @author ramkrit
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmbeddingService } from '../embedding/embedding.service';
import { LlmService, ChatMessage, LlmResponse } from '../llm/llm.service';
import { DocumentChunk, DocumentChunkDocument } from '../database/schemas/document-chunk.schema';

export interface RagResult {
  answer: string;
  sources: RagSource[];
  model: string;
  tokensUsed?: number;
}

export interface RagSource {
  documentId: string;
  filename: string;
  chunkIndex: number;
  content: string;
  score: number;
}

export interface RagOptions {
  /** Number of top chunks to retrieve (default: 5) */
  topK?: number;
  /** Minimum similarity score threshold (default: 0.3) */
  scoreThreshold?: number;
  /** Additional conversation history for context */
  history?: ChatMessage[];
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    @InjectModel(DocumentChunk.name)
    private readonly chunkModel: Model<DocumentChunkDocument>,
    private readonly embeddingService: EmbeddingService,
    private readonly llmService: LlmService,
  ) {}

  /**
   * Full RAG pipeline: query → retrieve → augment → generate
   */
  async query(userQuery: string, options: RagOptions = {}): Promise<RagResult> {
    const { topK = 5, scoreThreshold = 0.3, history = [] } = options;

    this.logger.log(`[wa-support-ai] RAG query: "${userQuery.substring(0, 80)}"`);

    // Step 1: Embed the user query
    const queryVector = await this.embeddingService.embedText(userQuery);

    // Step 2: Vector search in MongoDB
    const sources = await this.searchSimilarChunks(queryVector, topK, scoreThreshold);

    this.logger.debug(`[wa-support-ai] Retrieved ${sources.length} relevant chunks`);

    // Step 3: Build augmented prompt
    const messages = this.buildAugmentedPrompt(userQuery, sources, history);

    // Step 4: Generate answer with LLM
    const response = await this.llmService.chat(messages);

    this.logger.log(
      `[wa-support-ai] RAG response generated (${sources.length} sources, ${response.tokensUsed ?? '?'} tokens)`,
    );

    return {
      answer: response.content,
      sources,
      model: response.model,
      tokensUsed: response.tokensUsed,
    };
  }

  /**
   * Streaming RAG: same pipeline but streams the LLM response.
   * Returns sources separately since they're available before generation starts.
   */
  async *queryStream(
    userQuery: string,
    options: RagOptions = {},
  ): AsyncGenerator<{ type: 'sources'; data: RagSource[] } | { type: 'chunk'; data: string }> {
    const { topK = 5, scoreThreshold = 0.7, history = [] } = options;

    const queryVector = await this.embeddingService.embedText(userQuery);
    const sources = await this.searchSimilarChunks(queryVector, topK, scoreThreshold);

    // Emit sources first
    yield { type: 'sources', data: sources };

    // Build prompt and stream response
    const messages = this.buildAugmentedPrompt(userQuery, sources, history);

    for await (const chunk of this.llmService.chatStream(messages)) {
      yield { type: 'chunk', data: chunk };
    }
  }

  /**
   * Searches MongoDB for chunks similar to the query vector.
   *
   * Uses MongoDB Atlas $vectorSearch if available, otherwise
   * falls back to a manual cosine similarity calculation.
   */
  async searchSimilarChunks(
    queryVector: number[],
    topK: number,
    scoreThreshold: number,
  ): Promise<RagSource[]> {
    try {
      const results = await this.atlasVectorSearch(queryVector, topK, scoreThreshold);
      this.logger.log(`[wa-support-ai] Atlas vector search returned ${results.length} results`);
      return results;
    } catch (err) {
      this.logger.warn(
        `[wa-support-ai] Atlas vector search failed: ${err instanceof Error ? err.message : err}. Using fallback.`,
      );
      return this.fallbackCosineSimilarity(queryVector, topK, scoreThreshold);
    }
  }

  /**
   * MongoDB Atlas $vectorSearch aggregation pipeline.
   * Requires a vector search index named "chunk_embedding_index" on the collection.
   */
  private async atlasVectorSearch(
    queryVector: number[],
    topK: number,
    scoreThreshold: number,
  ): Promise<RagSource[]> {
    const results = await this.chunkModel.aggregate([
      {
        $vectorSearch: {
          index: 'autoembed_index',
          path: 'embedding',
          queryVector,
          numCandidates: Math.max(topK * 20, 100),
          limit: topK,
        },
      },
      {
        $addFields: {
          score: { $meta: 'vectorSearchScore' },
        },
      },
      {
        $project: {
          documentId: 1,
          filename: 1,
          chunkIndex: 1,
          content: 1,
          score: 1,
        },
      },
    ]);

    this.logger.log(
      `[wa-support-ai] Atlas raw results: ${results.length}, scores: [${results.map((r) => r.score?.toFixed(3)).join(', ')}]`,
    );

    // Filter by threshold AFTER retrieval
    return results
      .filter((r) => r.score >= scoreThreshold)
      .map((r) => ({
        documentId: r.documentId,
        filename: r.filename,
        chunkIndex: r.chunkIndex,
        content: r.content,
        score: r.score,
      }));
  }

  /**
   * Fallback cosine similarity search.
   * Loads all embedded chunks and computes similarity in-memory.
   * Works with local MongoDB (no Atlas needed), but slower for large datasets.
   */
  private async fallbackCosineSimilarity(
    queryVector: number[],
    topK: number,
    scoreThreshold: number,
  ): Promise<RagSource[]> {
    const chunks = await this.chunkModel
      .find({ embedding: { $exists: true, $not: { $size: 0 } } })
      .select('documentId filename chunkIndex content embedding')
      .lean()
      .exec();

    if (chunks.length === 0) return [];

    // Calculate cosine similarity for each chunk
    const scored = chunks.map((chunk) => ({
      ...chunk,
      score: this.cosineSimilarity(queryVector, chunk.embedding),
    }));

    // Sort by score, filter by threshold, take top K
    return scored
      .filter((c) => c.score >= scoreThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((c) => ({
        documentId: c.documentId,
        filename: c.filename,
        chunkIndex: c.chunkIndex,
        content: c.content,
        score: c.score,
      }));
  }

  /** Cosine similarity between two vectors */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * Builds the augmented prompt with retrieved context.
   */
  private buildAugmentedPrompt(
    userQuery: string,
    sources: RagSource[],
    history: ChatMessage[],
  ): ChatMessage[] {
    const contextBlock = sources.length > 0
      ? sources
          .map((s, i) => `[Source ${i + 1}: ${s.filename} (chunk ${s.chunkIndex})]\n${s.content}`)
          .join('\n\n')
      : 'No relevant documents found in the knowledge base.';

    const systemPrompt = `You are a helpful AI assistant for wa-support-ai.
You answer questions using the provided context from the knowledge base.

RULES:
- Answer based on the context provided below. If the context doesn't contain the answer, say so clearly.
- Cite your sources by referencing [Source N] when using information from the context.
- Be concise and practical.
- If the user asks something unrelated to the context, you can still answer using your general knowledge, but mention that it's not from the knowledge base.

CONTEXT FROM KNOWLEDGE BASE:
${contextBlock}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userQuery },
    ];

    return messages;
  }
}
