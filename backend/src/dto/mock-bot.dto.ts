import { ApiProperty } from '@nestjs/swagger';

/**
 * Summary of a conversation for the mock-bot console list view. Includes
 * the last message preview, unread count, and is sorted by latest activity.
 */
export class ConversationSummaryDto {
  @ApiProperty({ description: 'Unique conversation identifier' })
  id: string;

  @ApiProperty({ description: 'User ID this conversation belongs to' })
  userId: string;

  @ApiProperty({ description: 'User email for display' })
  userEmail: string;

  @ApiProperty({
    description: 'Preview of the last message (truncated to 100 chars)',
    nullable: true,
  })
  lastMessage: string | null;

  @ApiProperty({
    description: 'Who sent the last message',
    enum: ['USER', 'BOT'],
    nullable: true,
  })
  lastMessageSenderRole: 'USER' | 'BOT' | null;

  @ApiProperty({
    description: 'When the last message was sent',
    format: 'date-time',
    nullable: true,
  })
  lastMessageAt: string | null;

  @ApiProperty({
    description: 'Number of unread user messages (not yet marked as read)',
  })
  unreadCount: number;

  @ApiProperty({
    description: 'When the conversation was created',
    format: 'date-time',
  })
  createdAt: string;

  @ApiProperty({
    description: 'When the conversation was last updated',
    format: 'date-time',
  })
  updatedAt: string;

  constructor(partial: Partial<ConversationSummaryDto>) {
    Object.assign(this, partial);
  }
}

/**
 * Request body for POST /mock-bot/conversations/:userId/messages. The
 * operator replies on behalf of the bot to a specific user's conversation.
 */
export class MockBotReplyRequestDto {
  @ApiProperty({
    description: 'Reply text (non-empty, max 4000 characters after trimming)',
    example: 'Hello! How can I help you?',
    maxLength: 4000,
  })
  content: string;
}

/**
 * SSE event payload for /mock-bot/stream. Emitted whenever any user sends
 * a message or a bot replies. The console uses this to update the UI in
 * real-time without polling.
 */
export class MockBotStreamEventDto {
  @ApiProperty({ description: 'Unique message identifier' })
  messageId: string;

  @ApiProperty({ description: 'Conversation this message belongs to' })
  conversationId: string;

  @ApiProperty({ description: 'User ID for routing to the correct panel' })
  userId: string;

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

  constructor(partial: Partial<MockBotStreamEventDto>) {
    Object.assign(this, partial);
  }
}
