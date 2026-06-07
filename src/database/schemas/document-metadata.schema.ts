/**
 * DocumentMetadata Schema — wa-support-ai
 *
 * Stores metadata about ingested documents.
 * Tracks upload info, processing status, and chunk count.
 *
 * @author ramkrit
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DocumentMetadataDocument = HydratedDocument<DocumentMetadata>;

@Schema({ timestamps: true, collection: 'documents' })
export class DocumentMetadata {
  @Prop({ required: true, unique: true })
  documentId: string;

  @Prop({ required: true })
  filename: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop()
  fileSize: number;

  @Prop({ default: 0 })
  chunkCount: number;

  @Prop({ default: 0 })
  contentLength: number;

  @Prop({ default: 'completed' })
  status: string;
}

export const DocumentMetadataSchema = SchemaFactory.createForClass(DocumentMetadata);
