/**
 * WaChannelController — wa-support-ai
 *
 * REST + SSE controller for the WA channel transport layer.
 * Exposes endpoints for QR authentication, connection status,
 * outbound messaging, and real-time event streaming.
 *
 * @author ramkrit
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiTags,
  ApiProduces,
} from '@nestjs/swagger';
import { Response } from 'express';
import * as QRCode from 'qrcode';
import { merge, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SendMessageDto, SendMessageResponse } from './dto/send-message.dto';
import { WaChannelService, WaClientStatus } from './wa-channel.service';
import { ConfigService } from '@nestjs/config';
import { ConversationLog, ConversationLogDocument } from '../database/schemas/conversation-log.schema';
import { Ticket, TicketDocument } from '../database/schemas/ticket.schema';

/** Swagger response schema for the status endpoint */
class WaStatusResponse {
  @ApiProperty({ description: 'Current WA channel state', example: 'connected' })
  status: WaClientStatus;

  @ApiProperty({ description: 'Whether the channel is actively linked', example: true })
  active: boolean;

  @ApiProperty({ description: 'ISO timestamp of last state transition', example: '2025-12-18T15:00:00.000Z' })
  lastChanged: string;
}

@ApiTags('wa-channel')
@Controller('wa-channel')
export class WaChannelController {
  private readonly sendingApiUser: string;
  private readonly sendingApiPass: string;

  constructor(
    private readonly waChannelService: WaChannelService,
    private readonly configService: ConfigService,
    @InjectModel(ConversationLog.name)
    private readonly conversationLogModel: Model<ConversationLogDocument>,
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
  ) {
    this.sendingApiUser = this.configService.get<string>('WA_SEND_API_USER') ?? '';
    this.sendingApiPass = this.configService.get<string>('WA_SEND_API_PASS') ?? '';
  }

  /**
   * Serves the current QR code as a PNG image.
   * Returns 404 if no QR is available (already authenticated or not yet generated).
   */
  @Get('qr')
  @ApiProduces('image/png')
  @ApiOperation({ summary: 'Retrieve the WA channel authentication QR as PNG' })
  @ApiOkResponse({ description: 'QR code image for linking the WA session' })
  async getQr(@Res({ passthrough: false }) res: Response) {
    const qr = this.waChannelService.getQrCode();
    if (!qr) {
      throw new NotFoundException('[wa-support-ai] No QR available — session may already be linked');
    }

    const pngBuffer = await QRCode.toBuffer(qr, { type: 'png' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(pngBuffer);
  }

  /** Returns the current WA channel connection state */
  @Get('status')
  @ApiOperation({ summary: 'Get WA channel connection status' })
  @ApiOkResponse({ type: WaStatusResponse })
  getStatus() {
    return this.waChannelService.getStatus();
  }

  /**
   * Sends a text message through the WA channel.
   * Requires Basic Auth credentials configured via WA_SEND_API_USER/PASS.
   */
  @Post('send-message')
  @ApiOperation({ summary: 'Dispatch an outbound message via the WA channel' })
  @ApiOkResponse({ type: SendMessageResponse })
  async sendMessage(
    @Headers('authorization') authHeader: string | undefined,
    @Body() payload: SendMessageDto,
  ) {
    if (!this.hasValidCredentials(authHeader)) {
      throw new UnauthorizedException('[wa-support-ai] Invalid or missing API credentials');
    }
    return this.waChannelService.sendMessage(payload.number, payload.message);
  }

  /**
   * Server-Sent Events stream for real-time dashboard updates.
   * Emits 'status' events on connection state changes and 'qr' events
   * when a new QR code is generated.
   */
  @Sse('events')
  @ApiOperation({ summary: 'Subscribe to real-time WA channel events via SSE' })
  streamEvents(): Observable<MessageEventInit> {
    const statusStream = this.waChannelService.watchStatus().pipe(
      map((payload) => ({ type: 'status', data: payload })),
    );
    const qrStream = this.waChannelService.watchQr().pipe(
      map((qr) => ({ type: 'qr', data: { qr } })),
    );

    return merge(statusStream, qrStream).pipe(
      map((payload) => ({ data: JSON.stringify(payload) })),
    );
  }

  /** Get list of unique users who have chatted */
  @Get('users')
  @ApiOperation({ summary: 'Get all unique users who have interacted with the AI' })
  async getUniqueUsers() {
    const users = await this.conversationLogModel.aggregate([
      {
        $group: {
          _id: '$phoneNumber',
          contactName: { $last: '$contactName' },
          messageCount: { $sum: 1 },
          lastMessage: { $max: '$createdAt' },
          firstMessage: { $min: '$createdAt' },
        },
      },
      { $sort: { lastMessage: -1 } },
      {
        $project: {
          _id: 0,
          phoneNumber: '$_id',
          contactName: 1,
          messageCount: 1,
          lastMessage: 1,
          firstMessage: 1,
        },
      },
    ]);
    return { total: users.length, users };
  }

  /** Get conversation history for a specific phone number */
  @Get('conversations/:phoneNumber')
  @ApiOperation({ summary: 'Get conversation history for a user' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getConversationHistory(
    @Param('phoneNumber') phoneNumber: string,
    @Query('limit') limit?: string,
  ) {
    const maxResults = parseInt(limit || '50', 10);
    const logs = await this.conversationLogModel
      .find({ phoneNumber })
      .sort({ createdAt: -1 })
      .limit(maxResults)
      .lean()
      .exec();

    if (!logs.length) {
      throw new NotFoundException(`No conversations found for ${phoneNumber}`);
    }

    return {
      phoneNumber,
      contactName: logs[0]?.contactName,
      total: logs.length,
      messages: logs.reverse().map((log) => ({
        userMessage: log.userMessage,
        aiResponse: log.aiResponse,
        sources: log.retrievedContext,
        tokensUsed: log.tokensUsed,
        timestamp: log['createdAt'],
      })),
    };
  }

  /** Get all tickets, optionally filtered by phone number or status */
  @Get('tickets')
  @ApiOperation({ summary: 'Get all support tickets' })
  @ApiQuery({ name: 'phoneNumber', required: false })
  @ApiQuery({ name: 'status', required: false })
  async getTickets(
    @Query('phoneNumber') phoneNumber?: string,
    @Query('status') status?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (phoneNumber) filter.phoneNumber = phoneNumber;
    if (status) filter.status = status;

    const tickets = await this.ticketModel
      .find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return { total: tickets.length, tickets };
  }

  /** Validates Basic Auth header against configured sending credentials */
  private hasValidCredentials(authHeader?: string): boolean {
    if (!authHeader) return false;
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme !== 'Basic' || !encoded) return false;
    const credentials = Buffer.from(encoded, 'base64').toString('utf-8');
    return credentials === `${this.sendingApiUser}:${this.sendingApiPass}`;
  }
}
