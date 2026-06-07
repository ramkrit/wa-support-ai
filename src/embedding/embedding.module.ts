/**
 * EmbeddingModule — wa-support-ai
 *
 * Provides vector embedding generation using OpenAI's embedding models
 * via LangChain. Converts text into numerical vectors for similarity search.
 *
 * @author ramkrit
 */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmbeddingService } from './embedding.service';
import { EmbeddingController } from './embedding.controller';
import { DocumentChunk, DocumentChunkSchema } from '../database/schemas/document-chunk.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentChunk.name, schema: DocumentChunkSchema },
    ]),
  ],
  controllers: [EmbeddingController],
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
