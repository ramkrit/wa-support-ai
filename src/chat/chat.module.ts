/**
 * ChatModule — wa-support-ai
 *
 * Provides a web-based chat interface with RAG-powered responses.
 * Manages conversation sessions and exposes REST + SSE endpoints.
 *
 * @author ramkrit
 */
import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { RagModule } from '../rag/rag.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [LlmModule, RagModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
