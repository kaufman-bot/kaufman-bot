import { ApiProperty } from '@nestjs/swagger';

/**
 * Shape of a single chat message returned by the API. The `senderRole`
 * distinguishes user messages from bot replies; `readAt` is null until the
 * opposite side reads the message.
 */
export class ChatMessageDto {
  @ApiProperty({ description: 'Unique message identifier' })
  id: string;

  @ApiProperty({ description: 'Conversation this message belongs to' })
  conversationId: string;

  @ApiProperty({
    description: 'Who sent the message',
    enum: ['USER', 'BOT'],
  })
  senderRole: 'USER' | 'BOT';

  @ApiProperty({ description: 'Message text content' })
  content: string;

  @ApiProperty({
    description: 'When the opposite side read the message (null if unread)',
    nullable: true,
    format: 'date-time',
  })
  readAt: string | null;

  @ApiProperty({
    description: 'When the message was created',
    format: 'date-time',
  })
  createdAt: string;

  constructor(partial: Partial<ChatMessageDto>) {
    Object.assign(this, partial);
  }
}

/**
 * Request body for POST /chat/messages. The `content` field is validated:
 * non-empty after trimming, maximum 4000 characters.
 */
export class SendMessageRequestDto {
  @ApiProperty({
    description: 'Message text (non-empty, max 4000 characters after trimming)',
    example: 'Hello, bot!',
    maxLength: 4000,
  })
  content: string;
}

/**
 * SSE event payload for /chat/stream. The `type` field is intentionally
 * omitted so the browser's EventSource.onmessage receives it as a default
 * "message" event. All time values are ISO-8601 strings.
 */
export class ChatStreamEventDto {
  @ApiProperty({ description: 'Unique message identifier' })
  messageId: string;

  @ApiProperty({ description: 'Conversation this message belongs to' })
  conversationId: string;

  @ApiProperty({
    description: 'Who sent the message',
    enum: ['USER', 'BOT'],
  })
  senderRole: 'USER' | 'BOT';

  @ApiProperty({ description: 'Message text content' })
  content: string;

  @ApiProperty({
    description: 'When the message was created',
    format: 'date-time',
  })
  createdAt: string;

  constructor(partial: Partial<ChatStreamEventDto>) {
    Object.assign(this, partial);
  }
}
