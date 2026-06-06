/**
 * LlmService — wa-support-ai
 *
 * Wraps LangChain's ChatOpenAI model to provide a clean interface
 * for generating chat completions. Supports streaming and conversation
 * history for multi-turn interactions.
 *
 * @author ramkrit
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResponse {
  content: string;
  model: string;
  tokensUsed?: number;
}

@Injectable()
export class LlmService implements OnModuleInit {
  private readonly logger = new Logger(LlmService.name);
  private model: ChatOpenAI;
  private modelName: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const modelName = this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';

    if (!apiKey) {
      this.logger.error('[wa-support-ai] OPENAI_API_KEY is not set — LLM module will not function');
      return;
    }

    this.model = new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName,
      temperature: 0.7,
      maxTokens: 1024,
    });

    this.modelName = modelName;
    this.logger.log(`[wa-support-ai] LLM initialized with model: ${modelName}`);
  }

  /**
   * Generates a chat completion from a list of messages.
   * Converts our ChatMessage format to LangChain's message types.
   */
  async chat(messages: ChatMessage[]): Promise<LlmResponse> {
    if (!this.model) {
      throw new Error('[wa-support-ai] LLM not initialized — check OPENAI_API_KEY');
    }

    const langChainMessages = this.toLangChainMessages(messages);

    this.logger.debug(`[wa-support-ai] Sending ${messages.length} messages to LLM`);

    const response = await this.model.invoke(langChainMessages);

    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    return {
      content,
      model: this.modelName,
      tokensUsed: (response.usage_metadata as { total_tokens?: number })?.total_tokens,
    };
  }

  /**
   * Streams a chat completion token by token.
   * Returns an async generator yielding content chunks.
   */
  async *chatStream(messages: ChatMessage[]): AsyncGenerator<string> {
    if (!this.model) {
      throw new Error('[wa-support-ai] LLM not initialized — check OPENAI_API_KEY');
    }

    const langChainMessages = this.toLangChainMessages(messages);

    this.logger.debug(`[wa-support-ai] Streaming ${messages.length} messages to LLM`);

    const stream = await this.model.stream(langChainMessages);

    for await (const chunk of stream) {
      const content = typeof chunk.content === 'string' ? chunk.content : '';
      if (content) {
        yield content;
      }
    }
  }

  /** Converts our simple message format to LangChain BaseMessage instances */
  private toLangChainMessages(messages: ChatMessage[]): BaseMessage[] {
    return messages.map((msg) => {
      switch (msg.role) {
        case 'system':
          return new SystemMessage(msg.content);
        case 'user':
          return new HumanMessage(msg.content);
        case 'assistant':
          return new AIMessage(msg.content);
        default:
          return new HumanMessage(msg.content);
      }
    });
  }
}
