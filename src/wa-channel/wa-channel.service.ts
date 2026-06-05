/**
 * WaChannelService — wa-support-ai
 *
 * Manages the headless WhatsApp Web client lifecycle for the wa-support-ai system.
 * Handles session authentication, real-time status broadcasting, inbound message
 * processing, and outbound message delivery through the WA channel transport layer.
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
import { Client, LocalAuth, type Contact, type Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import { BehaviorSubject, Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';

/**
 * Patches LocalAuth.logout to gracefully handle EBUSY errors on Windows
 * when session files are locked by Chromium processes.
 */
const patchLocalAuthLogout = (() => {
  let patched = false;
  return (logger: Logger) => {
    if (patched) return;

    const proto = LocalAuth.prototype as {
      logout: () => Promise<void>;
      __waChannelLogoutPatched?: boolean;
    };
    if (proto.__waChannelLogoutPatched) {
      patched = true;
      return;
    }

    const originalLogout = proto.logout;
    proto.logout = async function () {
      try {
        await originalLogout.call(this);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes('EBUSY') ||
            error.message.includes('resource busy or locked'))
        ) {
          logger.warn(
            '[wa-support-ai] Session file locked during cleanup, skipping gracefully',
            error.message,
          );
          return;
        }
        throw error;
      }
    };

    proto.__waChannelLogoutPatched = true;
    patched = true;
  };
})();

export type WaClientStatus = 'disconnected' | 'awaiting_scan' | 'connected';

export interface WaStatusPayload {
  status: WaClientStatus;
  active: boolean;
  lastChanged: string;
}

@Injectable()
export class WaChannelService implements OnModuleInit {
  private readonly logger = new Logger(WaChannelService.name);
  private client: Client;
  private status: WaClientStatus = 'disconnected';
  private statusUpdatedAt = new Date();
  private lastQr: string | null = null;

  private statusSubject = new BehaviorSubject<WaStatusPayload>(this.snapshotStatus());
  private qrSubject = new BehaviorSubject<string | null>(this.lastQr);

  constructor(private readonly configService: ConfigService) {
    patchLocalAuthLogout(this.logger);

    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        handleSIGINT: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      },
    });
  }

  onModuleInit() {
    this.initializeClient();
  }

  // ── Public Interface ──────────────────────────────────────────────────

  /** Returns the latest QR string or null if already authenticated */
  getQrCode(): string | null {
    return this.lastQr;
  }

  /** Returns a snapshot of the current channel connection state */
  getStatus(): WaStatusPayload {
    return this.snapshotStatus();
  }

  /** Observable stream of status changes for SSE consumers */
  watchStatus(): Observable<WaStatusPayload> {
    return this.statusSubject.asObservable();
  }

  /** Observable stream of QR code updates for SSE consumers */
  watchQr(): Observable<string | null> {
    return this.qrSubject.asObservable();
  }

  /**
   * Sends a text message through the WA channel.
   * Validates connection state and phone number before dispatching.
   */
  async sendMessage(targetNumber: string, message: string) {
    if (this.status !== 'connected') {
      throw new ServiceUnavailableException('[wa-support-ai] Channel not connected — cannot send');
    }

    const normalizedNumber = this.normalizePhoneNumber(targetNumber);
    const trimmedMessage = message?.trim();
    if (!trimmedMessage) {
      throw new BadRequestException('Outbound message body cannot be empty');
    }

    const numberId = await this.client.getNumberId(normalizedNumber);
    if (!numberId) {
      throw new NotFoundException(
        `[wa-support-ai] Number ${normalizedNumber} not found on WhatsApp`,
      );
    }

    const sentMessage = await this.client.sendMessage(numberId._serialized, trimmedMessage);

    this.logger.log(`[wa-support-ai] Message dispatched to ${normalizedNumber}`);

    return {
      id: sentMessage.id?._serialized ?? null,
      number: normalizedNumber,
      message: trimmedMessage,
    };
  }

  // ── Client Lifecycle ──────────────────────────────────────────────────

  /** Boots the headless WA client and registers all event handlers */
  private initializeClient() {
    this.client.on('qr', (qr) => {
      this.emitQr(qr);
      this.updateStatus('awaiting_scan');
      this.logger.log('[wa-support-ai] QR generated — waiting for phone scan');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      this.logger.log('[wa-support-ai] Channel is live and ready to process messages');
      this.updateStatus('connected');
      this.emitQr(null);
    });

    this.client.on('authenticated', () => {
      this.logger.log('[wa-support-ai] Session authenticated successfully');
      this.updateStatus('connected');
    });

    this.client.on('auth_failure', (reason) => {
      this.logger.error('[wa-support-ai] Authentication failed — re-scan required', reason);
      this.updateStatus('disconnected');
      this.emitQr(null);
    });

    this.client.on('disconnected', (reason) => {
      this.logger.warn('[wa-support-ai] Channel disconnected unexpectedly', reason);
      this.updateStatus('disconnected');
      this.emitQr(null);
    });

    this.client.on('message', async (msg) => {
      try {
        await this.handleIncomingMessage(msg);
      } catch (error) {
        this.logger.error('[wa-support-ai] Failed to process inbound message', error);
      }
    });

    this.client.initialize();
  }

  // ── Inbound Message Processing ────────────────────────────────────────

  /** Processes an incoming WA message and logs it */
  private async handleIncomingMessage(msg: Message) {
    const chat = await msg.getChat();
    const contact = await msg.getContact();

    this.logger.log(
      `[wa-support-ai] Inbound from ${contact.pushname || contact.number} in "${chat?.name ?? 'DM'}": ${msg.body?.substring(0, 80)}`,
    );
  }

  /** Attempts to extract base64 image data from media messages */
  private async extractImage(msg: Message): Promise<string | null> {
    type MediaMessage = Message & {
      hasMedia?: () => Promise<boolean>;
      downloadMedia?: () => Promise<{ data: string } | null>;
      _data?: { body?: string };
    };
    const mediaMessage = msg as MediaMessage;

    if (mediaMessage.type === 'image') {
      if (typeof mediaMessage.hasMedia === 'boolean' && mediaMessage.hasMedia) {
        const media = await mediaMessage.downloadMedia?.();
        if (media?.data) return media.data;
      }

      const fallback = mediaMessage.body?.trim() || mediaMessage._data?.body?.trim();
      if (fallback) return fallback;
    }
    return null;
  }

  /** Creates a serializable snapshot of the raw message object */
  private buildSnapshot(msg: Message): Record<string, unknown> {
    try {
      return JSON.parse(JSON.stringify(msg));
    } catch {
      return { id: msg.id, body: msg.body, from: msg.from, author: msg.author, timestamp: msg.timestamp };
    }
  }

  /** Resolves the sender's phone number from contact or message metadata */
  private resolveSenderNumber(contact: Contact, msg: Message): string {
    return contact.number ?? contact.id?.user ?? msg.author ?? msg.from ?? 'unknown';
  }

  // ── Internal Utilities ────────────────────────────────────────────────

  /** Strips non-digit characters and validates phone number input */
  private normalizePhoneNumber(input: string): string {
    if (!input) throw new BadRequestException('Phone number is required');
    const digits = input.replace(/\D/g, '');
    if (!digits) throw new BadRequestException('Phone number must contain digits');
    return digits;
  }

  private emitQr(qr: string | null) {
    this.lastQr = qr;
    this.qrSubject.next(qr);
  }

  private updateStatus(status: WaClientStatus) {
    this.status = status;
    this.statusUpdatedAt = new Date();
    this.statusSubject.next(this.snapshotStatus());
  }

  private snapshotStatus(): WaStatusPayload {
    return {
      status: this.status,
      active: this.status === 'connected',
      lastChanged: this.statusUpdatedAt.toISOString(),
    };
  }
}
