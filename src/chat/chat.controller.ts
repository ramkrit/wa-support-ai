/**
 * ChatController — wa-support-ai
 *
 * Exposes REST endpoints for the chat interface:
 * - POST /chat/send — send a message and get a full response
 * - POST /chat/stream — send a message and get SSE streamed response
 * - GET /chat/history/:sessionId — retrieve conversation history
 * - DELETE /chat/session/:sessionId — clear a session
 * - GET /chat — serves the chat UI
 *
 * @author ramkrit
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ChatService } from './chat.service';
import { SendChatMessageDto, ChatResponseDto } from './dto/chat-message.dto';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

/** Load the chat HTML page at startup */
const chatHtml = readFileSync(join(__dirname, 'pages', 'chat.page.html'), 'utf-8');

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /** Sends a message and returns the full AI response */
  @Post('send')
  @ApiOperation({ summary: 'Send a message and receive AI response' })
  @ApiOkResponse({ type: ChatResponseDto })
  async sendMessage(@Body() dto: SendChatMessageDto): Promise<ChatResponseDto> {
    const sessionId = dto.sessionId || randomUUID();
    const response = await this.chatService.sendMessage(sessionId, dto.message);

    return {
      content: response.content,
      model: response.model,
      sessionId,
      tokensUsed: response.tokensUsed,
    };
  }

  /** Streams the AI response via Server-Sent Events */
  @Post('stream')
  @ApiOperation({ summary: 'Send a message and receive streamed AI response via SSE' })
  async streamMessage(
    @Body() dto: SendChatMessageDto,
    @Res() res: Response,
  ) {
    const sessionId = dto.sessionId || randomUUID();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Session-Id', sessionId);

    try {
      for await (const chunk of this.chatService.streamMessage(sessionId, dto.message)) {
        res.write(`data: ${JSON.stringify({ content: chunk, sessionId })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true, sessionId })}\n\n`);
    } catch (error) {
      res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`);
    }

    res.end();
  }

  /** Returns conversation history for a session */
  @Get('history/:sessionId')
  @ApiOperation({ summary: 'Get conversation history for a session' })
  getHistory(@Param('sessionId') sessionId: string) {
    return {
      sessionId,
      messages: this.chatService.getHistory(sessionId),
    };
  }

  /** Clears a conversation session */
  @Delete('session/:sessionId')
  @ApiOperation({ summary: 'Clear a conversation session' })
  clearSession(@Param('sessionId') sessionId: string) {
    this.chatService.clearSession(sessionId);
    return { success: true, message: `Session ${sessionId} cleared` };
  }

  /** Serves the chat UI */
  @Get()
  @ApiOperation({ summary: 'Chat interface UI' })
  getChatUI(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(chatHtml);
  }
}
