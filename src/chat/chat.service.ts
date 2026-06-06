/**
 * ChatService — wa-support-ai
 *
 * Manages conversation sessions (in-memory) and orchestrates
 * interactions with the LLM service. Each session maintains
 * its own message history for multi-turn conversations.
 *
 * @author ramkrit
 */
import { Injectable, Logger } from '@nestjs/common';
import { LlmService, ChatMessage, LlmResponse } from '../llm/llm.service';

export interface ConversationSession {
  id: string;
  messages: ChatMessage[];
  createdAt: Date;
  lastActiveAt: Date;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private sessions = new Map<string, ConversationSession>();

  private readonly systemPrompt: string = `You are a helpful AI assistant for wa-support-ai. 
You answer questions clearly and concisely. If you don't know something, say so honestly.
Keep responses focused and practical.`;

  constructor(private readonly llmService: LlmService) {}

  /**
   * Sends a user message in a session and returns the LLM response.
   * Creates a new session if one doesn't exist for the given ID.
   */
  async sendMessage(sessionId: string, userMessage: string): Promise<LlmResponse> {
    const session = this.getOrCreateSession(sessionId);

    // Add user message to history
    session.messages.push({ role: 'user', content: userMessage });
    session.lastActiveAt = new Date();

    this.logger.log(`[wa-support-ai] Chat session ${sessionId} — user: ${userMessage.substring(0, 60)}`);

    // Build the full message list with system prompt
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...session.messages,
    ];

    // Get LLM response
    const response = await this.llmService.chat(fullMessages);

    // Store assistant reply in history
    session.messages.push({ role: 'assistant', content: response.content });

    this.logger.debug(`[wa-support-ai] Chat session ${sessionId} — response generated (${response.tokensUsed ?? '?'} tokens)`);

    return response;
  }

  /**
   * Streams the LLM response token by token.
   * Stores the complete response in history once streaming finishes.
   */
  async *streamMessage(sessionId: string, userMessage: string): AsyncGenerator<string> {
    const session = this.getOrCreateSession(sessionId);

    session.messages.push({ role: 'user', content: userMessage });
    session.lastActiveAt = new Date();

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...session.messages,
    ];

    let fullResponse = '';
    for await (const chunk of this.llmService.chatStream(fullMessages)) {
      fullResponse += chunk;
      yield chunk;
    }

    // Store complete response in history
    session.messages.push({ role: 'assistant', content: fullResponse });
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
