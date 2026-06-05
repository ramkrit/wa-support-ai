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
  Post,
  Res,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiProduces,
} from '@nestjs/swagger';
import { Response } from 'express';
import * as QRCode from 'qrcode';
import { merge, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SendMessageDto, SendMessageResponse } from './dto/send-message.dto';
import { WaChannelService, WaClientStatus } from './wa-channel.service';
import { ConfigService } from '@nestjs/config';

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

  /** Validates Basic Auth header against configured sending credentials */
  private hasValidCredentials(authHeader?: string): boolean {
    if (!authHeader) return false;
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme !== 'Basic' || !encoded) return false;
    const credentials = Buffer.from(encoded, 'base64').toString('utf-8');
    return credentials === `${this.sendingApiUser}:${this.sendingApiPass}`;
  }
}
