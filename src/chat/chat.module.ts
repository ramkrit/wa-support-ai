/**
 * ChatModule — wa-support-ai
 *
 * Provides a web-based chat interface for directly interacting
 * with the LLM. Manages conversation sessions and exposes
 * REST + SSE endpoints for the chat UI.
 *
 * @author ramkrit
 */
import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [LlmModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
