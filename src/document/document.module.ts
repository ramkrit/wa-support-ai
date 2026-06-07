/**
 * DocumentModule — wa-support-ai
 *
 * Handles document ingestion for the RAG pipeline.
 * Responsibilities:
 * - Upload documents (PDF, TXT, CSV)
 * - Load and parse file content
 * - Chunk documents into manageable pieces
 * - Expose endpoints for document management
 *
 * Later integrates with Embedding + VectorStore modules
 * to complete the ingestion pipeline.
 *
 * @author ramkrit
 */
import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { ChunkingService } from './chunking/chunking.service';

@Module({
  controllers: [DocumentController],
  providers: [DocumentService, ChunkingService],
  exports: [DocumentService, ChunkingService],
})
export class DocumentModule {}
