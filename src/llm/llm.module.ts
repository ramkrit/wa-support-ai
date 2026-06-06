/**
 * LlmModule — wa-support-ai
 *
 * Provides the LLM service powered by OpenAI via LangChain.
 * Handles prompt construction and chat completion calls.
 *
 * @author ramkrit
 */
import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';

@Module({
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
