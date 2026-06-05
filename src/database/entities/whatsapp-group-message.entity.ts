import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity({ name: 'tp_whatsapp_group_messages' })
export class WhatsappGroupMessage {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  @ApiProperty({ description: 'Auto-incremented ID of the saved message' })
  id: number;

  @Column({ name: 'group_name', type: 'varchar', length: 255 })
  @ApiProperty({ description: 'Name of the WhatsApp group that sent the message' })
  groupName: string;

  @Column({ name: 'received_number', type: 'varchar', length: 20 })
  @ApiProperty({ description: 'Phone number that received the message' })
  receivedNumber: string;

  @Column({ name: 'message_body', type: 'text' })
  @ApiProperty({ description: 'Message body text that was received' })
  messageBody: string;

  @Column({ name: 'image', type: 'longtext', nullable: true })
  @ApiProperty({
    description: 'Optional base64-encoded image payload if the user sent a picture',
    type: String,
    required: false,
  })
  image?: string | null;

  @Column({ name: 'input_data', type: 'json' })
  @ApiProperty({ type: Object, description: 'Raw WhatsApp payload stored for debugging' })
  inputData: Record<string, unknown>;

  @CreateDateColumn({
    name: 'added_date',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  @ApiProperty({ description: 'Timestamp when the message was persisted', type: String, format: 'date-time' })
  addedDate: Date;
}
