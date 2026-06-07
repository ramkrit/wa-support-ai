/**
 * DocumentService — wa-support-ai
 *
 * Orchestrates the document ingestion pipeline:
 * 1. Receive uploaded file
 * 2. Load/parse content based on file type
 * 3. Chunk the content into pieces
 * 4. Store document metadata + chunks in MongoDB
 *
 * @author ramkrit
 */
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { ChunkingService, ChunkingOptions } from './chunking/chunking.service';
import { loadPdf } from './loaders/pdf.loader';
import { loadText } from './loaders/text.loader';
import { SupportedMimeType } from './interfaces/document.interface';
import { EmbeddingService } from '../embedding/embedding.service';
import { DocumentChunk, DocumentChunkDocument } from '../database/schemas/document-chunk.schema';
import { DocumentMetadata, DocumentMetadataDocument } from '../database/schemas/document-metadata.schema';

/** Summary returned after ingestion */
export interface IngestionResult {
  documentId: string;
  filename: string;
  contentLength: number;
  chunkCount: number;
  processedAt: string;
}

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  private readonly supportedTypes: SupportedMimeType[] = [
    'application/pdf',
    'text/plain',
    'text/csv',
    'text/markdown',
  ];

  constructor(
    @InjectModel(DocumentChunk.name)
    private readonly chunkModel: Model<DocumentChunkDocument>,
    @InjectModel(DocumentMetadata.name)
    private readonly metadataModel: Model<DocumentMetadataDocument>,
    private readonly chunkingService: ChunkingService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Ingests a file: loads content, chunks it, and stores everything in MongoDB.
   */
  async ingest(
    file: Express.Multer.File,
    options?: ChunkingOptions,
  ): Promise<IngestionResult> {
    this.validateFile(file);

    const documentId = randomUUID();
    const mimeType = file.mimetype as SupportedMimeType;

    this.logger.log(
      `[wa-support-ai] Ingesting document: ${file.originalname} (${mimeType}, ${file.size} bytes)`,
    );

    // Step 1: Load content based on file type
    const content = await this.loadContent(file.buffer, mimeType);

    // Step 2: Chunk the content
    const textChunks = await this.chunkingService.chunkText(content, options);

    // Step 3: Store metadata in MongoDB
    await this.metadataModel.create({
      documentId,
      filename: file.originalname,
      mimeType,
      fileSize: file.size,
      chunkCount: textChunks.length,
      contentLength: content.length,
      status: 'completed',
    });

    // Step 4: Store chunks in MongoDB
    const chunkDocs = textChunks.map((chunk) => ({
      documentId,
      content: chunk.content,
      chunkIndex: chunk.index,
      totalChunks: textChunks.length,
      filename: file.originalname,
      mimeType,
      source: 'upload',
      fileSize: file.size,
    }));

    await this.chunkModel.insertMany(chunkDocs);

    // Step 5: Generate embeddings for the new chunks (async, non-blocking)
    this.embeddingService.embedUnprocessedChunks().catch((err) => {
      this.logger.warn(`[wa-support-ai] Embedding failed for ${file.originalname}: ${err.message}`);
    });

    this.logger.log(
      `[wa-support-ai] Document ingested: ${file.originalname} → ${textChunks.length} chunks stored in MongoDB`,
    );

    return {
      documentId,
      filename: file.originalname,
      contentLength: content.length,
      chunkCount: textChunks.length,
      processedAt: new Date().toISOString(),
    };
  }

  /** Returns all stored documents (metadata only) */
  async listDocuments() {
    const docs = await this.metadataModel.find().sort({ createdAt: -1 }).exec();
    return docs.map((doc) => ({
      id: doc.documentId,
      filename: doc.filename,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      chunkCount: doc.chunkCount,
      contentLength: doc.contentLength,
      status: doc.status,
      createdAt: doc['createdAt'],
    }));
  }

  /** Returns chunks for a specific document */
  async getChunks(documentId: string) {
    const chunks = await this.chunkModel
      .find({ documentId })
      .sort({ chunkIndex: 1 })
      .exec();

    if (!chunks.length) {
      throw new NotFoundException(`[wa-support-ai] Document ${documentId} not found`);
    }

    return chunks.map((chunk) => ({
      id: chunk._id,
      documentId: chunk.documentId,
      content: chunk.content,
      chunkIndex: chunk.chunkIndex,
      totalChunks: chunk.totalChunks,
      filename: chunk.filename,
    }));
  }

  /** Returns all chunks across all documents (for vector store ingestion) */
  async getAllChunks() {
    return this.chunkModel.find().sort({ documentId: 1, chunkIndex: 1 }).exec();
  }

  /** Deletes a document and its chunks */
  async deleteDocument(documentId: string) {
    const metadata = await this.metadataModel.findOne({ documentId }).exec();
    if (!metadata) {
      throw new NotFoundException(`[wa-support-ai] Document ${documentId} not found`);
    }

    await this.chunkModel.deleteMany({ documentId }).exec();
    await this.metadataModel.deleteOne({ documentId }).exec();

    this.logger.log(`[wa-support-ai] Document ${documentId} deleted from MongoDB`);
  }

  // ── Private Helpers ───────────────────────────────────────────────────

  /** Routes to the correct loader based on MIME type */
  private async loadContent(buffer: Buffer, mimeType: SupportedMimeType): Promise<string> {
    switch (mimeType) {
      case 'application/pdf': {
        const result = await loadPdf(buffer);
        return result.text;
      }
      case 'text/plain':
      case 'text/csv':
      case 'text/markdown': {
        const result = loadText(buffer);
        return result.text;
      }
      default:
        throw new BadRequestException(`[wa-support-ai] Unsupported file type: ${mimeType}`);
    }
  }

  /** Validates file before processing */
  private validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('[wa-support-ai] No file provided');
    }
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('[wa-support-ai] Uploaded file is empty');
    }
    if (!this.supportedTypes.includes(file.mimetype as SupportedMimeType)) {
      throw new BadRequestException(
        `[wa-support-ai] Unsupported file type: ${file.mimetype}. Supported: ${this.supportedTypes.join(', ')}`,
      );
    }
  }
}
