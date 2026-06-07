/**
 * DocumentService — wa-support-ai
 *
 * Orchestrates the document ingestion pipeline:
 * 1. Receive uploaded file
 * 2. Load/parse content based on file type
 * 3. Chunk the content into pieces
 * 4. Store document metadata + chunks in memory (later: DB + vector store)
 *
 * @author ramkrit
 */
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ChunkingService, ChunkingOptions } from './chunking/chunking.service';
import { loadPdf } from './loaders/pdf.loader';
import { loadText } from './loaders/text.loader';
import {
  RawDocument,
  DocumentChunk,
  DocumentMetadata,
  SupportedMimeType,
} from './interfaces/document.interface';

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

  /** In-memory store — will be replaced with DB/vector store later */
  private documents = new Map<string, RawDocument>();
  private chunks = new Map<string, DocumentChunk[]>();

  private readonly supportedTypes: SupportedMimeType[] = [
    'application/pdf',
    'text/plain',
    'text/csv',
    'text/markdown',
  ];

  constructor(private readonly chunkingService: ChunkingService) {}

  /**
   * Ingests a file: loads content, chunks it, and stores everything.
   * This is the main entry point for document upload.
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

    // Step 2: Build metadata
    const metadata: DocumentMetadata = {
      source: 'upload',
      filename: file.originalname,
      mimeType,
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
    };

    // Step 3: Store raw document
    const rawDoc: RawDocument = {
      id: documentId,
      filename: file.originalname,
      mimeType,
      content,
      metadata,
      uploadedAt: new Date(),
    };
    this.documents.set(documentId, rawDoc);

    // Step 4: Chunk the content
    const textChunks = await this.chunkingService.chunkText(content, options);

    const docChunks: DocumentChunk[] = textChunks.map((chunk) => ({
      id: `${documentId}_chunk_${chunk.index}`,
      documentId,
      content: chunk.content,
      metadata: {
        ...metadata,
        chunkIndex: chunk.index,
        totalChunks: textChunks.length,
      },
    }));

    this.chunks.set(documentId, docChunks);

    this.logger.log(
      `[wa-support-ai] Document ingested: ${file.originalname} → ${docChunks.length} chunks`,
    );

    return {
      documentId,
      filename: file.originalname,
      contentLength: content.length,
      chunkCount: docChunks.length,
      processedAt: new Date().toISOString(),
    };
  }

  /** Returns all stored documents (metadata only, no content) */
  listDocuments() {
    return Array.from(this.documents.values()).map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      mimeType: doc.mimeType,
      contentLength: doc.content.length,
      chunkCount: this.chunks.get(doc.id)?.length ?? 0,
      uploadedAt: doc.uploadedAt,
    }));
  }

  /** Returns chunks for a specific document */
  getChunks(documentId: string): DocumentChunk[] {
    const chunks = this.chunks.get(documentId);
    if (!chunks) {
      throw new NotFoundException(`[wa-support-ai] Document ${documentId} not found`);
    }
    return chunks;
  }

  /** Returns all chunks across all documents (for vector store ingestion) */
  getAllChunks(): DocumentChunk[] {
    const all: DocumentChunk[] = [];
    for (const chunks of this.chunks.values()) {
      all.push(...chunks);
    }
    return all;
  }

  /** Deletes a document and its chunks */
  deleteDocument(documentId: string): void {
    if (!this.documents.has(documentId)) {
      throw new NotFoundException(`[wa-support-ai] Document ${documentId} not found`);
    }
    this.documents.delete(documentId);
    this.chunks.delete(documentId);
    this.logger.log(`[wa-support-ai] Document ${documentId} deleted`);
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
