import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({
    description: 'Target phone number in international format (digits only or with +)',
    example: '+15551234567',
  })
  number: string;

  @ApiProperty({
    description: 'Text body that should be delivered to the recipient',
    example: 'Hi there, this is an automated update!',
  })
  message: string;
}

export class SendMessageResponse {
  @ApiProperty({
    description: 'Serialized WhatsApp identifier for the sent message',
    example: 'ABCD1234',
    nullable: true,
  })
  id: string | null;

  @ApiProperty({
    description: 'Normalized destination number that received the message',
    example: '15551234567',
  })
  number: string;

  @ApiProperty({
    description: 'Text payload that was delivered',
    example: 'Hi there, this is an automated update!',
  })
  message: string;
}
