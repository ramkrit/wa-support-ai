/**
 * RagModule — wa-support-ai
 *
 * Retrieval-Augmented Generation orchestrator.
 * Wires together: Embedding → MongoDB Vector Search → LLM
 *
 * Flow: user query → embed query → vector search (MongoDB) →
 * build augmented prompt with context → LLM generates answer
 *
 * @author ramkrit
 */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RagService } from './rag.service';
import { EmbeddingModule } from '../embedding/embedding.module';
import { LlmModule } from '../llm/llm.module';
import { DocumentChunk, DocumentChunkSchema } from '../database/schemas/document-chunk.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentChunk.name, schema: DocumentChunkSchema },
    ]),
    EmbeddingModule,
    LlmModule,
  ],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
