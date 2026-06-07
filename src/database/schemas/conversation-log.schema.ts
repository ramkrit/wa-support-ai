/**
 * ConversationLog Schema — wa-support-ai
 *
 * Stores every message exchange for a WhatsApp conversation.
 * Tracks: user question, retrieved context, AI response, sources used.
 *
 * @author ramkrit
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type ConversationLogDocument = HydratedDocument<ConversationLog>;

@Schema({ timestamps: true, collection: 'conversation_logs' })
export class ConversationLog {
  @Prop({ required: true, index: true })
  phoneNumber: string;

  @Prop()
  contactName: string;

  @Prop({ required: true })
  userMessage: string;

  @Prop()
  aiResponse: string;

  @Prop({ type: [{ filename: String, chunkIndex: Number, content: String, score: Number }], default: [] })
  retrievedContext: Array<{
    filename: string;
    chunkIndex: number;
    content: string;
    score: number;
  }>;

  @Prop()
  llmModel: string;

  @Prop()
  tokensUsed: number;

  @Prop({ default: 'completed' })
  status: string;

  @Prop()
  errorMessage: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, unknown>;
}

export const ConversationLogSchema = SchemaFactory.createForClass(ConversationLog);
