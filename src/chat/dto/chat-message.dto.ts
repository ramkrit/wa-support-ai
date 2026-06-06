import { ApiProperty } from '@nestjs/swagger';

export class SendChatMessageDto {
  @ApiProperty({
    description: 'The user message to send to the AI',
    example: 'What is retrieval-augmented generation?',
  })
  message: string;

  @ApiProperty({
    description: 'Session ID for conversation continuity (optional, auto-generated if empty)',
    example: 'session-abc123',
    required: false,
  })
  sessionId?: string;
}

export class ChatResponseDto {
  @ApiProperty({ description: 'AI response content' })
  content: string;

  @ApiProperty({ description: 'Model used for generation' })
  model: string;

  @ApiProperty({ description: 'Session ID for this conversation' })
  sessionId: string;

  @ApiProperty({ description: 'Total tokens used', required: false })
  tokensUsed?: number;
}
