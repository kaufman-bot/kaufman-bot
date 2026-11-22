import { ApiExtraModels, ApiProperty } from '@nestjs/swagger';
import { KeyboardButtonDto } from './keyboard.dto.js';

/**
 * Snapshot of the message a reply quotes: reference plus the minimal
 * readable subset (who wrote it and its text). Embedded in message DTOs
 * and SSE events; null when the reply has no quoted message.
 */
export class MessageQuoteDto {
  @ApiProperty({ description: 'Identifier of the quoted message' })
  id: string;

  @ApiProperty({
    description: 'Who sent the quoted message',
    enum: ['USER', 'BOT'],
  })
  senderRole: 'USER' | 'BOT';

  @ApiProperty({ description: 'Text content of the quoted message' })
  content: string;

  constructor(partial: Partial<MessageQuoteDto>) {
    Object.assign(this, partial);
  }
}

/**
 * Channels a message was delivered to, derived from the channel snapshot:
 * USER messages carry the single channel they were written from; BOT
 * replies carry both WEB and TELEGRAM when the reply also went to Telegram.
 */
export type DeliveredTo = Array<'WEB' | 'TELEGRAM'>;

/**
 * Shape of a single chat message returned by the API. The `senderRole`
 * distinguishes user messages from bot replies; `readAt` is null until the
 * opposite side reads the message. `buttons` is either null or the ordered
 * snapshot of inline keyboard buttons captured when the bot message was
 * sent (never mutated by later preset edits).
 */
@ApiExtraModels(KeyboardButtonDto, MessageQuoteDto)
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
    description:
      'Transport channel snapshot: for USER messages — where the user wrote ' +
      'from, for BOT messages — where the reply was delivered (null for ' +
      'messages recorded before the snapshot existed)',
    enum: ['WEB', 'TELEGRAM'],
    nullable: true,
  })
  channel: 'WEB' | 'TELEGRAM' | null;

  @ApiProperty({
    description:
      'Name of the Telegram bot in the channel snapshot: the bot that ' +
      'received a USER message or delivered a BOT reply (null for WEB)',
    type: String,
    nullable: true,
  })
  botName: string | null;

  @ApiProperty({
    description:
      'Email of the console operator who sent a BOT reply from the mock-bot ' +
      'console (null for plugin auto-replies and USER messages)',
    type: String,
    nullable: true,
  })
  operatorEmail: string | null;

  @ApiProperty({
    description:
      'Snapshot of the message this reply quotes (null when the reply was ' +
      'sent without quoting a message)',
    type: MessageQuoteDto,
    nullable: true,
  })
  replyTo: MessageQuoteDto | null;

  @ApiProperty({
    description:
      'Channels the message was delivered to: USER messages carry the ' +
      'single channel they were written from; BOT replies carry both ' +
      "'WEB' and 'TELEGRAM' when the reply also went to Telegram",
    enum: ['WEB', 'TELEGRAM'],
    isArray: true,
  })
  deliveredTo: DeliveredTo;

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
    if (this.channel === undefined) {
      this.channel = null;
    }
    if (this.botName === undefined) {
      this.botName = null;
    }
    if (this.operatorEmail === undefined) {
      this.operatorEmail = null;
    }
    if (this.replyTo === undefined) {
      this.replyTo = null;
    }
    if (this.deliveredTo === undefined) {
      this.deliveredTo = ['WEB'];
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
@ApiExtraModels(KeyboardButtonDto, MessageQuoteDto)
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
    description:
      'Transport channel snapshot: for USER events — where the user wrote ' +
      'from, for BOT events — where the reply was delivered',
    enum: ['WEB', 'TELEGRAM'],
    nullable: true,
  })
  channel: 'WEB' | 'TELEGRAM' | null;

  @ApiProperty({
    description:
      'Name of the Telegram bot in the channel snapshot (null for WEB)',
    type: String,
    nullable: true,
  })
  botName: string | null;

  @ApiProperty({
    description:
      'Email of the console operator who sent a BOT reply (null when none)',
    type: String,
    nullable: true,
  })
  operatorEmail: string | null;

  @ApiProperty({
    description:
      'Snapshot of the message this reply quotes (null when the reply was ' +
      'sent without quoting a message)',
    type: MessageQuoteDto,
    nullable: true,
  })
  replyTo: MessageQuoteDto | null;

  @ApiProperty({
    description:
      'Channels the message was delivered to (see ChatMessageDto.deliveredTo)',
    enum: ['WEB', 'TELEGRAM'],
    isArray: true,
  })
  deliveredTo: DeliveredTo;

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
    if (this.channel === undefined) {
      this.channel = null;
    }
    if (this.botName === undefined) {
      this.botName = null;
    }
    if (this.operatorEmail === undefined) {
      this.operatorEmail = null;
    }
    if (this.replyTo === undefined) {
      this.replyTo = null;
    }
    if (this.deliveredTo === undefined) {
      this.deliveredTo = ['WEB'];
    }
  }
}
