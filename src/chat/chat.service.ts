/**
 * ChatService — wa-support-ai
 *
 * Manages conversation sessions and orchestrates RAG-powered
 * interactions. Each session maintains message history for
 * multi-turn conversations with knowledge base context.
 *
 * @author ramkrit
 */
import { Injectable, Logger } from '@nestjs/common';
import { LlmService, ChatMessage, LlmResponse } from '../llm/llm.service';
import { RagService, RagResult, RagSource } from '../rag/rag.service';

export interface ConversationSession {
  id: string;
  messages: ChatMessage[];
  createdAt: Date;
  lastActiveAt: Date;
}

export interface ChatResponse {
  content: string;
  model: string;
  tokensUsed?: number;
  sources?: RagSource[];
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private sessions = new Map<string, ConversationSession>();

  constructor(
    private readonly llmService: LlmService,
    private readonly ragService: RagService,
  ) {}

  /**
   * Sends a user message through the RAG pipeline.
   * Retrieves relevant context from the knowledge base, then generates a response.
   */
  async sendMessage(sessionId: string, userMessage: string): Promise<ChatResponse> {
    const session = this.getOrCreateSession(sessionId);

    session.messages.push({ role: 'user', content: userMessage });
    session.lastActiveAt = new Date();

    this.logger.log(`[wa-support-ai] Chat session ${sessionId} — user: ${userMessage.substring(0, 60)}`);

    // Use RAG pipeline (retrieves context + generates answer)
    const ragResult = await this.ragService.query(userMessage, {
      topK: 5,
      scoreThreshold: 0.3,
      history: session.messages.slice(0, -1), // Pass history without the current message
    });

    // Store assistant reply in history
    session.messages.push({ role: 'assistant', content: ragResult.answer });

    this.logger.debug(
      `[wa-support-ai] Chat session ${sessionId} — RAG response (${ragResult.sources.length} sources, ${ragResult.tokensUsed ?? '?'} tokens)`,
    );

    return {
      content: ragResult.answer,
      model: ragResult.model,
      tokensUsed: ragResult.tokensUsed,
      sources: ragResult.sources,
    };
  }

  /**
   * Streams the RAG response token by token.
   * Yields sources first, then content chunks.
   */
  async *streamMessage(
    sessionId: string,
    userMessage: string,
  ): AsyncGenerator<{ type: 'sources'; data: RagSource[] } | { type: 'chunk'; data: string }> {
    const session = this.getOrCreateSession(sessionId);

    session.messages.push({ role: 'user', content: userMessage });
    session.lastActiveAt = new Date();

    let fullResponse = '';

    for await (const event of this.ragService.queryStream(userMessage, {
      topK: 5,
      scoreThreshold: 0.3,
      history: session.messages.slice(0, -1),
    })) {
      if (event.type === 'sources') {
        yield event;
      } else {
        fullResponse += event.data;
        yield event;
      }
    }

    // Store complete response in history
    session.messages.push({ role: 'assistant', content: fullResponse });
  }

  /**
   * Direct LLM chat (no RAG, no knowledge base).
   * Useful for general questions that don't need document context.
   */
  async sendDirectMessage(sessionId: string, userMessage: string): Promise<LlmResponse> {
    const session = this.getOrCreateSession(sessionId);

    session.messages.push({ role: 'user', content: userMessage });
    session.lastActiveAt = new Date();

    const systemPrompt = `You are a helpful AI assistant for wa-support-ai.
You answer questions clearly and concisely. If you don't know something, say so honestly.`;

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...session.messages,
    ];

    const response = await this.llmService.chat(fullMessages);
    session.messages.push({ role: 'assistant', content: response.content });

    return response;
  }

  /** Returns the conversation history for a session */
  getHistory(sessionId: string): ChatMessage[] {
    const session = this.sessions.get(sessionId);
    return session ? session.messages : [];
  }

  /** Clears a conversation session */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.logger.log(`[wa-support-ai] Chat session ${sessionId} cleared`);
  }

  /** Gets or creates a conversation session */
  private getOrCreateSession(sessionId: string): ConversationSession {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        messages: [],
        createdAt: new Date(),
        lastActiveAt: new Date(),
      };
      this.sessions.set(sessionId, session);
      this.logger.log(`[wa-support-ai] New chat session created: ${sessionId}`);
    }
    return session;
  }
}
