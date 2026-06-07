/**
 * DocumentChunk Schema — wa-support-ai
 *
 * Stores chunked document content in MongoDB for the RAG pipeline.
 * Each chunk belongs to a parent document and carries its own metadata.
 *
 * @author ramkrit
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DocumentChunkDocument = HydratedDocument<DocumentChunk>;

@Schema({ timestamps: true, collection: 'document_chunks' })
export class DocumentChunk {
  @Prop({ required: true, index: true })
  documentId: string;

  @Prop({ required: true })
  content: string;

  @Prop({ required: true })
  chunkIndex: number;

  @Prop({ required: true })
  totalChunks: number;

  @Prop({ required: true })
  filename: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop()
  source: string;

  @Prop()
  fileSize: number;

  @Prop({ type: [Number], default: [] })
  embedding: number[];
}

export const DocumentChunkSchema = SchemaFactory.createForClass(DocumentChunk);
