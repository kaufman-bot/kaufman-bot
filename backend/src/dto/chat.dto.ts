import { ApiExtraModels, ApiProperty } from '@nestjs/swagger';
import { KeyboardButtonDto } from './keyboard.dto.js';

/**
 * Shape of a single chat message returned by the API. The `senderRole`
 * distinguishes user messages from bot replies; `readAt` is null until the
 * opposite side reads the message. `buttons` is either null or the ordered
 * snapshot of inline keyboard buttons captured when the bot message was
 * sent (never mutated by later preset edits).
 */
@ApiExtraModels(KeyboardButtonDto)
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
    description:
      'Inline keyboard buttons attached to a bot message (null when the ' +
      'message has no buttons). For user-side reads, callback messages ' +
      '(kind=BUTTON) are filtered out before reaching the client, so this ' +
      'field is only ever present on BOT messages of the user history.',
    type: KeyboardButtonDto,
    isArray: true,
    nullable: true,
  })
  buttons: KeyboardButtonDto[] | null;

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
    if (this.buttons === undefined) {
      this.buttons = null;
    }
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
 * Request body for POST /chat/button-callbacks — fires when a user presses
 * an inline keyboard button. The server persists the payload as a USER
 * message with `kind=BUTTON` (visible to the operator console, suppressed
 * from the user's own history/SSE and not dispatched to plugins).
 */
export class ButtonCallbackRequestDto {
  @ApiProperty({
    description:
      'Opaque callbackData carried by the pressed button (non-empty, max 256 characters)',
    maxLength: 256,
    example: 'confirm:order:42',
  })
  callbackData: string;
}

/**
 * SSE event payload for /chat/stream. The `type` field is intentionally
 * omitted so the browser's EventSource.onmessage receives it as a default
 * "message" event. All time values are ISO-8601 strings. Events with
 * `kind=BUTTON` are filtered out before reaching the user stream, so
 * `buttons` here is only ever set on BOT messages.
 */
@ApiExtraModels(KeyboardButtonDto)
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

  constructor(partial: Partial<ChatStreamEventDto>) {
    Object.assign(this, partial);
    if (this.buttons === undefined) {
      this.buttons = null;
    }
  }
}
