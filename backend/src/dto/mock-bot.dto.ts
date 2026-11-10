import { ApiExtraModels, ApiProperty } from '@nestjs/swagger';
import { KeyboardButtonDto } from './keyboard.dto.js';

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
 *
 * At least one of `content` or `buttons` MUST be non-empty; a request with
 * neither is rejected with 400 by the service. When `buttons` is provided,
 * it is validated (non-empty title/callbackData, length limits, 1..12 items)
 * and stored on the message as an immutable snapshot.
 */
@ApiExtraModels(KeyboardButtonDto)
export class MockBotReplyRequestDto {
  @ApiProperty({
    description:
      'Optional reply text (max 4000 characters after trimming). Must be ' +
      'present together with at least one button when omitted.',
    example: 'Hello! How can I help you?',
    maxLength: 4000,
    required: false,
  })
  content?: string;

  @ApiProperty({
    description:
      'Optional ordered set of inline keyboard buttons attached to the ' +
      'reply (1..12 items). Required when `content` is empty.',
    type: KeyboardButtonDto,
    isArray: true,
    required: false,
  })
  buttons?: KeyboardButtonDto[];
}

/**
 * SSE event payload for /mock-bot/stream. Emitted whenever any user sends
 * a message or a bot replies. The console uses this to update the UI in
 * real-time without polling.
 *
 * Callback messages produced by the user pressing a button are also
 * published here (kind=BUTTON) with the operator-visible `content` set to
 * the pressed `callbackData`. The console renders them as ordinary USER
 * messages so the operator sees the click without a page reload.
 */
@ApiExtraModels(KeyboardButtonDto)
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
    description:
      'Inline keyboard buttons attached to a bot message (null when none)',
    type: KeyboardButtonDto,
    isArray: true,
    nullable: true,
  })
  buttons: KeyboardButtonDto[] | null;

  @ApiProperty({
    description: 'When the message was created',
    format: 'date-time',
  })
  createdAt: string;

  constructor(partial: Partial<MockBotStreamEventDto>) {
    Object.assign(this, partial);
    if (this.buttons === undefined) {
      this.buttons = null;
    }
  }
}
