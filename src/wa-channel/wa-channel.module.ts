/**
 * WaChannelModule — wa-support-ai
 *
 * WhatsApp transport layer with RAG-powered AI assistant.
 * Handles incoming messages, processes them through the RAG pipeline,
 * and sends intelligent responses. Logs all conversations to MongoDB.
 *
 * @author ramkrit
 */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WaChannelService } from './wa-channel.service';
import { WaChannelController } from './wa-channel.controller';
import { RagModule } from '../rag/rag.module';
import { ConversationLog, ConversationLogSchema } from '../database/schemas/conversation-log.schema';
import { Ticket, TicketSchema } from '../database/schemas/ticket.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ConversationLog.name, schema: ConversationLogSchema },
      { name: Ticket.name, schema: TicketSchema },
    ]),
    RagModule,
  ],
  controllers: [WaChannelController],
  providers: [WaChannelService],
  exports: [WaChannelService],
})
export class WaChannelModule {}
