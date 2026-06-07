/**
 * Core interfaces for the Document module — wa-support-ai
 *
 * Defines the shape of documents as they flow through
 * the ingestion pipeline: upload → load → chunk → (embed → store)
 */

/** Represents a raw uploaded document before processing */
export interface RawDocument {
  id: string;
  filename: string;
  mimeType: string;
  content: string;
  metadata: DocumentMetadata;
  uploadedAt: Date;
}

/** Metadata attached to every document */
export interface DocumentMetadata {
  source: string;
  filename: string;
  mimeType: string;
  fileSize?: number;
  pageCount?: number;
  uploadedAt: string;
  [key: string]: unknown;
}

/** A chunk produced after splitting a document */
export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  metadata: DocumentMetadata & {
    chunkIndex: number;
    totalChunks: number;
  };
}

/** Supported file types for ingestion */
export type SupportedMimeType =
  | 'application/pdf'
  | 'text/plain'
  | 'text/csv'
  | 'text/markdown';
