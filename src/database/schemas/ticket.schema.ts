/**
 * Ticket Schema — wa-support-ai
 *
 * Stores support tickets raised by customers via the AI assistant.
 * Types: complaint, cancellation, update_details, call_request, general
 *
 * @author ramkrit
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TicketDocument = HydratedDocument<Ticket>;

export type TicketType = 'complaint' | 'cancellation' | 'update_details' | 'call_request' | 'general';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

@Schema({ timestamps: true, collection: 'tickets' })
export class Ticket {
  @Prop({ required: true, unique: true })
  ticketId: string;

  @Prop({ required: true, index: true })
  phoneNumber: string;

  @Prop()
  contactName: string;

  @Prop({ required: true, enum: ['complaint', 'cancellation', 'update_details', 'call_request', 'general'] })
  type: TicketType;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  description: string;

  @Prop({ default: 'open', enum: ['open', 'in_progress', 'resolved', 'closed'] })
  status: TicketStatus;

  @Prop({ default: 'medium', enum: ['low', 'medium', 'high', 'urgent'] })
  priority: TicketPriority;

  @Prop()
  bookingReference: string;

  @Prop()
  tourName: string;

  @Prop({ type: [String], default: [] })
  conversationHistory: string[];

  @Prop()
  resolvedAt: Date;

  @Prop()
  resolvedBy: string;

  @Prop()
  notes: string;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);
