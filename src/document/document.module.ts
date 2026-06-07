/**
 * DocumentModule — wa-support-ai
 *
 * Handles document ingestion for the RAG pipeline.
 * Responsibilities:
 * - Upload documents (PDF, TXT, CSV, MD)
 * - Load and parse file content
 * - Chunk documents into manageable pieces
 * - Store chunks in MongoDB
 *
 * @author ramkrit
 */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { ChunkingService } from './chunking/chunking.service';
import { EmbeddingModule } from '../embedding/embedding.module';
import { DocumentChunk, DocumentChunkSchema } from '../database/schemas/document-chunk.schema';
import { DocumentMetadata, DocumentMetadataSchema } from '../database/schemas/document-metadata.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentChunk.name, schema: DocumentChunkSchema },
      { name: DocumentMetadata.name, schema: DocumentMetadataSchema },
    ]),
    EmbeddingModule,
  ],
  controllers: [DocumentController],
  providers: [DocumentService, ChunkingService],
  exports: [DocumentService, ChunkingService],
})
export class DocumentModule {}
