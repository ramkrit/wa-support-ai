/**
 * WaChannelService — wa-support-ai
 *
 * Manages the headless WhatsApp Web client for SetNGo Holidays AI assistant.
 * Integrates RAG pipeline for intelligent responses, logs all conversations,
 * and handles ticket/complaint creation when the AI cannot resolve issues.
 *
 * @author ramkrit
 */
import {
  Injectable,
  OnModuleInit,
  Logger,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client, LocalAuth, type Contact, type Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import { BehaviorSubject, Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { RagService } from '../rag/rag.service';
import { ConversationLog, ConversationLogDocument } from '../database/schemas/conversation-log.schema';
import { Ticket, TicketDocument, TicketType } from '../database/schemas/ticket.schema';

/**
 * Patches LocalAuth.logout to gracefully handle EBUSY errors on Windows.
 */
const patchLocalAuthLogout = (() => {
  let patched = false;
  return (logger: Logger) => {
    if (patched) return;
    const proto = LocalAuth.prototype as { logout: () => Promise<void>; __patched?: boolean };
    if (proto.__patched) { patched = true; return; }
    const original = proto.logout;
    proto.logout = async function () {
      try { await original.call(this); } catch (e) {
        if (e instanceof Error && (e.message.includes('EBUSY') || e.message.includes('resource busy'))) {
          logger.warn('[wa-support-ai] Session cleanup busy, skipping'); return;
        }
        throw e;
      }
    };
    proto.__patched = true; patched = true;
  };
})();

export type WaClientStatus = 'disconnected' | 'awaiting_scan' | 'connected';
export interface WaStatusPayload { status: WaClientStatus; active: boolean; lastChanged: string; }


@Injectable()
export class WaChannelService implements OnModuleInit {
  private readonly logger = new Logger(WaChannelService.name);
  private client: Client;
  private status: WaClientStatus = 'disconnected';
  private statusUpdatedAt = new Date();
  private lastQr: string | null = null;
  private statusSubject = new BehaviorSubject<WaStatusPayload>(this.snapshotStatus());
  private qrSubject = new BehaviorSubject<string | null>(this.lastQr);

  /** Tracks first-time contacts for greeting */
  private greetedContacts = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly ragService: RagService,
    @InjectModel(ConversationLog.name)
    private readonly conversationLogModel: Model<ConversationLogDocument>,
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
  ) {
    patchLocalAuthLogout(this.logger);
    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        handleSIGINT: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      },
    });
  }

  onModuleInit() { this.initializeClient(); }

  // ── Public Interface ──────────────────────────────────────────────────

  getQrCode(): string | null { return this.lastQr; }
  getStatus(): WaStatusPayload { return this.snapshotStatus(); }
  watchStatus(): Observable<WaStatusPayload> { return this.statusSubject.asObservable(); }
  watchQr(): Observable<string | null> { return this.qrSubject.asObservable(); }

  async sendMessage(targetNumber: string, message: string) {
    if (this.status !== 'connected') {
      throw new ServiceUnavailableException('[wa-support-ai] Channel not connected');
    }
    const normalized = this.normalizePhoneNumber(targetNumber);
    const trimmed = message?.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');

    const numberId = await this.client.getNumberId(normalized);
    if (!numberId) throw new NotFoundException(`Number ${normalized} not found on WhatsApp`);

    const sent = await this.client.sendMessage(numberId._serialized, trimmed);
    this.logger.log(`[wa-support-ai] Message dispatched to ${normalized}`);
    return { id: sent.id?._serialized ?? null, number: normalized, message: trimmed };
  }

  // ── Client Lifecycle ──────────────────────────────────────────────────

  private initializeClient() {
    this.client.on('qr', (qr) => {
      this.emitQr(qr); this.updateStatus('awaiting_scan');
      this.logger.log('[wa-support-ai] QR generated — waiting for scan');
      qrcode.generate(qr, { small: true });
    });
    this.client.on('ready', () => {
      this.logger.log('[wa-support-ai] Channel live — AI assistant ready');
      this.updateStatus('connected'); this.emitQr(null);
    });
    this.client.on('authenticated', () => { this.updateStatus('connected'); });
    this.client.on('auth_failure', (reason) => {
      this.logger.error('[wa-support-ai] Auth failed', reason);
      this.updateStatus('disconnected'); this.emitQr(null);
    });
    this.client.on('disconnected', (reason) => {
      this.logger.warn('[wa-support-ai] Disconnected', reason);
      this.updateStatus('disconnected'); this.emitQr(null);
    });
    this.client.on('message', async (msg) => {
      try { await this.handleIncomingMessage(msg); }
      catch (error) { this.logger.error('[wa-support-ai] Message processing failed', error); }
    });
    this.client.initialize();
  }

  // ── AI-Powered Message Handler ────────────────────────────────────────

  private async handleIncomingMessage(msg: Message) {
    if (!msg.body || msg.body.trim().length === 0) return;
    if (msg.from === 'status@broadcast') return;

    const contact = await msg.getContact();
    const phoneNumber = contact.id?.user || msg.from?.split('@')[0] || 'unknown';
    const contactName = contact.pushname || contact.name || 'Customer';
    const userMessage = msg.body.trim();

    this.logger.log(`[wa-support-ai] Inbound from ${contactName} (${phoneNumber}): ${userMessage.substring(0, 80)}`);

    // Check if first-time contact (for greeting)
    const isFirstMessage = !this.greetedContacts.has(phoneNumber);
    if (isFirstMessage) this.greetedContacts.add(phoneNumber);

    // Get recent conversation history for context
    const history = await this.getRecentHistory(phoneNumber, 10);

    // Get existing open tickets for this customer (to prevent duplicates)
    const existingTickets = await this.getOpenTickets(phoneNumber);
    const ticketContext = existingTickets.length > 0
      ? `\n\nEXISTING OPEN TICKETS FOR THIS CUSTOMER:\n${existingTickets.map((t) => `- [${t.ticketId}] ${t.type}: ${t.subject} (Status: ${t.status})`).join('\n')}\nDo NOT create a duplicate ticket if one already covers the same issue. Instead, inform the customer their existing ticket is being handled.`
      : '';

    // Show "typing..." indicator while AI processes
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    let aiResponse: string;
    let sources: Array<{ filename: string; chunkIndex: number; content: string; score: number }> = [];
    let tokensUsed: number | undefined;
    let model: string = '';

    try {
      const ragResult = await this.ragService.query(userMessage, {
        topK: 5,
        scoreThreshold: 0.3,
        history: [
          ...history,
          ...(isFirstMessage ? [{ role: 'system' as const, content: 'This is the customer\'s FIRST message. Greet them warmly.' }] : []),
          ...(ticketContext ? [{ role: 'system' as const, content: ticketContext }] : []),
        ],
      });

      aiResponse = ragResult.answer;
      sources = ragResult.sources;
      tokensUsed = ragResult.tokensUsed;
      model = ragResult.model;
    } catch (error) {
      this.logger.error('[wa-support-ai] RAG pipeline failed', error);
      aiResponse = "I'm sorry, I'm having a temporary issue. Please try again in a moment, or I can arrange a callback for you. Would you like me to do that?";
    }

    // Check if AI wants to create a ticket
    const ticketData = this.extractTicketFromResponse(aiResponse);
    if (ticketData) {
      await this.createTicket(phoneNumber, contactName, ticketData, userMessage);
      // Remove the ticket JSON block from the response
      aiResponse = aiResponse.replace(/```ticket[\s\S]*?```/g, '').trim();
      // If the remaining response is empty or just filler, replace with confirmation
      if (!aiResponse || aiResponse.length < 20) {
        aiResponse = `✅ I've raised a ${ticketData.type.replace(/_/g, ' ')} ticket for you.\n\n📋 *Ticket Ref:* ${ticketData.ticketId}\n📌 *Subject:* ${ticketData.subject}\n⏳ *Status:* Open\n\nOur team will get back to you shortly. Is there anything else I can help with?`;
      } else {
        // Append ticket confirmation to whatever the AI said
        aiResponse += `\n\n📋 *Ticket Created:* ${ticketData.ticketId}`;
      }
    }

    // Log conversation to MongoDB
    await this.logConversation({
      phoneNumber,
      contactName,
      userMessage,
      aiResponse,
      sources,
      model,
      tokensUsed,
    });

    // Send response via WhatsApp (typing indicator auto-clears on send)
    await chat.sendMessage(aiResponse);
    this.logger.log(`[wa-support-ai] Replied to ${contactName} (${phoneNumber})`);
  }

  // ── Ticket Management ─────────────────────────────────────────────────

  private extractTicketFromResponse(response: string): { type: TicketType; subject: string; description: string; priority: string; bookingReference?: string; tourName?: string; ticketId: string } | null {
    const ticketMatch = response.match(/```ticket\s*([\s\S]*?)\s*```/);
    if (!ticketMatch) return null;

    try {
      const parsed = JSON.parse(ticketMatch[1]);
      return {
        ...parsed,
        ticketId: `TKT-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`,
      };
    } catch {
      this.logger.warn('[wa-support-ai] Failed to parse ticket JSON from AI response');
      return null;
    }
  }

  private async createTicket(
    phoneNumber: string,
    contactName: string,
    ticketData: { type: TicketType; subject: string; description: string; priority: string; bookingReference?: string; tourName?: string; ticketId: string },
    originalMessage: string,
  ) {
    await this.ticketModel.create({
      ticketId: ticketData.ticketId,
      phoneNumber,
      contactName,
      type: ticketData.type,
      subject: ticketData.subject,
      description: ticketData.description,
      priority: (ticketData.priority || 'medium') as 'low' | 'medium' | 'high' | 'urgent',
      bookingReference: ticketData.bookingReference || '',
      tourName: ticketData.tourName || '',
      status: 'open',
      conversationHistory: [originalMessage],
    });

    this.logger.log(`[wa-support-ai] Ticket created: ${ticketData.ticketId} (${ticketData.type}) for ${phoneNumber}`);
  }

  /** Get all open/in-progress tickets for a customer */
  private async getOpenTickets(phoneNumber: string) {
    return this.ticketModel
      .find({ phoneNumber, status: { $in: ['open', 'in_progress'] } })
      .select('ticketId type subject status priority createdAt')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
      .exec();
  }

  // ── Conversation Logging ──────────────────────────────────────────────

  private async logConversation(data: {
    phoneNumber: string;
    contactName: string;
    userMessage: string;
    aiResponse: string;
    sources: Array<{ filename: string; chunkIndex: number; content: string; score: number }>;
    model: string;
    tokensUsed?: number;
  }) {
    await this.conversationLogModel.create({
      phoneNumber: data.phoneNumber,
      contactName: data.contactName,
      userMessage: data.userMessage,
      aiResponse: data.aiResponse,
      retrievedContext: data.sources as any[],
      llmModel: data.model,
      tokensUsed: data.tokensUsed,
      status: 'completed' as const,
    });
  }

  /** Get recent conversation history for a phone number */
  private async getRecentHistory(phoneNumber: string, limit: number) {
    const logs = await this.conversationLogModel
      .find({ phoneNumber })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    // Reverse to get chronological order, then convert to ChatMessage format
    return logs.reverse().flatMap((log) => [
      { role: 'user' as const, content: log.userMessage },
      { role: 'assistant' as const, content: log.aiResponse },
    ]);
  }

  // ── Internal Utilities ────────────────────────────────────────────────

  private normalizePhoneNumber(input: string): string {
    if (!input) throw new BadRequestException('Phone number is required');
    const digits = input.replace(/\D/g, '');
    if (!digits) throw new BadRequestException('Phone number must contain digits');
    return digits;
  }

  private emitQr(qr: string | null) { this.lastQr = qr; this.qrSubject.next(qr); }

  private updateStatus(status: WaClientStatus) {
    this.status = status; this.statusUpdatedAt = new Date();
    this.statusSubject.next(this.snapshotStatus());
  }

  private snapshotStatus(): WaStatusPayload {
    return { status: this.status, active: this.status === 'connected', lastChanged: this.statusUpdatedAt.toISOString() };
  }
}
