import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ChatMessageDto, MessageQuoteDto } from '../dto/chat.dto.js';
import { KeyboardButtonDto } from '../dto/keyboard.dto.js';
import {
  ConversationSummaryDto,
  MockBotStreamEventDto,
} from '../dto/mock-bot.dto.js';
import { MessageKind, MessageSenderRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  normalizeButtons,
  toButtons,
  validateButtons,
} from '../utils/keyboard-buttons.js';
import {
  ChatEvent,
  ChatEventsService,
  MessageReplySnapshot,
} from './chat-events.service.js';
import {
  deriveDeliveredTo,
  MessageChannelService,
} from './message-channel.service.js';

/** Maximum length of a reply content after trimming. */
const MAX_CONTENT_LENGTH = 4000;

/** Maximum length of the last message preview in conversation summary. */
const LAST_MESSAGE_PREVIEW_LENGTH = 100;

/**
 * Operator-side mock-bot console use cases: list conversations with unread
 * counts, read a specific user's messages, reply as the bot (optionally
 * with an inline keyboard snapshot), and stream real-time events from all
 * users.
 */
@Injectable()
export class MockBotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatEvents: ChatEventsService,
    private readonly messageChannel: MessageChannelService,
  ) {}

  /**
   * Lists all conversations with their last message preview, unread count,
   * and user email. Sorted by latest activity (most recent first).
   */
  async listConversations(): Promise<ConversationSummaryDto[]> {
    const conversations = await this.prisma.conversation.findMany({
      include: {
        user: {
          select: { id: true, email: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const summaries: ConversationSummaryDto[] = [];

    for (const conv of conversations) {
      const lastMessage = conv.messages[0] || null;

      // Count unread user messages (messages from USER with readAt = null)
      const unreadCount = await this.prisma.message.count({
        where: {
          conversationId: conv.id,
          senderRole: MessageSenderRole.USER,
          readAt: null,
        },
      });

      summaries.push(
        new ConversationSummaryDto({
          id: conv.id,
          userId: conv.userId,
          userEmail: conv.user.email,
          lastMessage: lastMessage
            ? this.truncate(lastMessage.content, LAST_MESSAGE_PREVIEW_LENGTH)
            : null,
          lastMessageSenderRole: lastMessage
            ? (lastMessage.senderRole as 'USER' | 'BOT')
            : null,
          lastMessageChannel: lastMessage?.channel ?? null,
          lastMessageAt: lastMessage?.createdAt.toISOString() ?? null,
          unreadCount,
          createdAt: conv.createdAt.toISOString(),
          updatedAt: conv.updatedAt.toISOString(),
        }),
      );
    }

    return summaries;
  }

  /**
   * Retrieves all messages for a specific user's conversation and marks
   * them as read (the operator is viewing them). Returns messages ordered
   * by creation time ascending.
   *
   * Unlike the user-side history, the operator console sees everything:
   * ordinary text, bot replies (with their inline keyboard snapshot) and
   * user button callbacks. Callback messages carry `kind=BUTTON` and their
   * `content` equals the pressed `callbackData`, so the operator can trace
   * every click without reloading the page.
   */
  async getConversationMessages(userId: string): Promise<ChatMessageDto[]> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            replyTo: { select: { id: true, senderRole: true, content: true } },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found for this user');
    }

    // Mark all user messages as read (operator is viewing them)
    await this.prisma.message.updateMany({
      where: {
        conversationId: conversation.id,
        senderRole: MessageSenderRole.USER,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return conversation.messages.map((msg) => this.toMessageDto(msg));
  }

  /**
   * Sends a reply on behalf of the bot to a specific user's conversation.
   * Creates the conversation if it does not exist yet (edge case: operator
   * replies before the user has sent any messages).
   *
   * `content` is optional (trimmed) and `buttons` is optional; the reply
   * MUST carry at least one of them, otherwise 400 is raised. Buttons go
   * through `validateButtons` (1..12 items, per-field length limits) and
   * are stored on the message row as an immutable `Json` snapshot so later
   * edits or deletion of the source preset never rewrite this row.
   *
   * `operatorEmail` is the admin who sent the reply from the console; it is
   * persisted as the reply's identity snapshot (design D2).
   *
   * `replyToMessageId` (design D1/D3) links the reply to a USER message of
   * this conversation — validated before anything is written (missing,
   * foreign-conversation or non-USER targets raise 400 and never create an
   * empty conversation as a side effect). The delivery context is the
   * channel of the message the reply responds to: the quoted target for a
   * quoted reply, the last USER message for a plain reply, the binding
   * itself when there is none; the bridge suppresses Telegram forwarding
   * for non-Telegram contexts.
   */
  async replyAsBot(
    userId: string,
    content: string | undefined,
    buttons?: KeyboardButtonDto[],
    operatorEmail?: string | null,
    replyToMessageId?: string | null,
  ): Promise<ChatMessageDto> {
    const trimmed = typeof content === 'string' ? content.trim() : '';
    validateButtons(buttons);
    const normalizedButtons = normalizeButtons(buttons);

    if (!trimmed && (!normalizedButtons || normalizedButtons.length === 0)) {
      throw new BadRequestException(
        'Reply must contain text or at least one button',
      );
    }
    if (trimmed.length > MAX_CONTENT_LENGTH) {
      throw new BadRequestException(
        `Reply content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`,
      );
    }

    // Resolve the conversation first: the reply target (if any) must belong
    // to it, and an invalid target must not leave an empty conversation
    // behind as a side effect.
    const existingConversation = await this.prisma.conversation.findUnique({
      where: { userId },
    });

    // Validate the reply target (design D3): exists, same conversation,
    // sent by the user — otherwise the reply is rejected before writing.
    let replyTarget: {
      id: string;
      senderRole: MessageSenderRole;
      content: string;
      channel: 'WEB' | 'TELEGRAM' | null;
      telegramMessageId: number | null;
    } | null = null;
    if (replyToMessageId) {
      const target = await this.prisma.message.findUnique({
        where: { id: replyToMessageId },
      });
      if (
        !target ||
        !existingConversation ||
        target.conversationId !== existingConversation.id ||
        target.senderRole !== MessageSenderRole.USER
      ) {
        throw new BadRequestException(
          'Reply target must be an existing USER message of this conversation',
        );
      }
      replyTarget = {
        id: target.id,
        senderRole: target.senderRole,
        content: target.content,
        channel: target.channel ?? null,
        telegramMessageId: target.telegramMessageId ?? null,
      };
    }

    // Ensure conversation exists (create lazily if needed)
    const conversation =
      existingConversation ??
      (await this.prisma.conversation.upsert({
        where: { userId },
        update: {},
        create: { userId },
      }));

    // Delivery context (design D3): a quoted reply follows the target's
    // channel; a plain reply follows the conversation's last USER message;
    // with no user messages at all the binding itself is the context (null).
    let contextChannel: 'WEB' | 'TELEGRAM' | null = null;
    if (replyTarget) {
      contextChannel = replyTarget.channel;
    } else {
      const lastUserMessage = await this.prisma.message.findFirst({
        where: {
          conversationId: conversation.id,
          senderRole: MessageSenderRole.USER,
        },
        orderBy: { createdAt: 'desc' },
        select: { channel: true },
      });
      contextChannel = lastUserMessage?.channel ?? null;
    }

    // Where this reply actually lands at write time (same gate as the
    // Telegram bridge), plus who sent it — design D2 snapshots.
    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramBotId: true, telegramChatId: true },
    });
    const delivery = await this.messageChannel.resolveDelivery(
      contextChannel,
      owner,
    );

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderRole: MessageSenderRole.BOT,
        kind: MessageKind.TEXT,
        content: trimmed,
        buttons: normalizedButtons
          ? (normalizedButtons as unknown as object)
          : undefined,
        channel: delivery.channel,
        botName: delivery.botName,
        operatorEmail: operatorEmail ?? null,
        replyToId: replyTarget ? replyTarget.id : undefined,
      },
    });

    const dtoButtons = toButtons(message.buttons);
    const dto = new ChatMessageDto({
      id: message.id,
      conversationId: message.conversationId,
      senderRole: message.senderRole as 'USER' | 'BOT',
      content: message.content,
      buttons: dtoButtons,
      channel: message.channel ?? null,
      botName: message.botName ?? null,
      operatorEmail: message.operatorEmail ?? null,
      replyTo: replyTarget
        ? new MessageQuoteDto({
            id: replyTarget.id,
            senderRole: replyTarget.senderRole as 'USER' | 'BOT',
            content: replyTarget.content,
          })
        : null,
      deliveredTo: deriveDeliveredTo(
        message.channel ?? null,
        message.senderRole as 'USER' | 'BOT',
      ),
      readAt: message.readAt?.toISOString() ?? null,
      createdAt: message.createdAt.toISOString(),
    });

    // Publish event for real-time delivery (kind=TEXT: this is a normal
    // bot reply, visible to both the operator console and the user). The
    // event carries the full reply snapshot (design D2): the bridge needs
    // the target's Telegram message_id to send `reply_to_message_id`.
    const event: ChatEvent = {
      conversationId: conversation.id,
      messageId: message.id,
      senderRole: MessageSenderRole.BOT,
      content: trimmed,
      createdAt: dto.createdAt,
      kind: 'TEXT',
      buttons: dtoButtons,
      channel: message.channel ?? null,
      botName: message.botName ?? null,
      operatorEmail: message.operatorEmail ?? null,
      replyTo: replyTarget ? this.toReplySnapshot(replyTarget) : null,
    };
    this.chatEvents.publish(event);

    return dto;
  }

  /**
   * Returns an Observable that emits real-time chat events from all
   * conversations. The mock-bot console uses this to stream messages
   * from all users without filtering (including BUTTON-kind callbacks).
   */
  streamEvents(): Observable<MockBotStreamEventDto> {
    return this.chatEvents
      .streamAll()
      .pipe(map((event) => this.toStreamEvent(event)));
  }

  private toStreamEvent(event: ChatEvent): MockBotStreamEventDto {
    return new MockBotStreamEventDto({
      messageId: event.messageId,
      conversationId: event.conversationId,
      userId: '', // Will be enriched below
      senderRole: event.senderRole,
      content: event.content,
      buttons: event.buttons ?? null,
      channel: event.channel ?? null,
      botName: event.botName ?? null,
      operatorEmail: event.operatorEmail ?? null,
      edited: event.edited ?? false,
      replyTo: event.replyTo ? this.toQuoteDto(event.replyTo) : null,
      deliveredTo: deriveDeliveredTo(event.channel ?? null, event.senderRole),
      createdAt: event.createdAt,
    });
  }

  /** Full snapshot of the quoted message, as carried on a chat event. */
  private toReplySnapshot(target: {
    id: string;
    senderRole: MessageSenderRole;
    content: string;
    channel: 'WEB' | 'TELEGRAM' | null;
    telegramMessageId: number | null;
  }): MessageReplySnapshot {
    return {
      id: target.id,
      senderRole: target.senderRole as 'USER' | 'BOT',
      content: target.content,
      channel: target.channel ?? null,
      telegramMessageId: target.telegramMessageId ?? null,
    };
  }

  /** User-facing subset of the reply snapshot exposed in DTOs. */
  private toQuoteDto(replyTo: MessageReplySnapshot): MessageQuoteDto {
    return new MessageQuoteDto({
      id: replyTo.id,
      senderRole: replyTo.senderRole,
      content: replyTo.content,
    });
  }

  /** Maps a persisted message row (with its joined replyTo) to the DTO. */
  private toMessageDto(msg: {
    id: string;
    conversationId: string;
    senderRole: MessageSenderRole;
    content: string;
    buttons?: unknown;
    channel?: 'WEB' | 'TELEGRAM' | null;
    botName?: string | null;
    operatorEmail?: string | null;
    readAt: Date | null;
    createdAt: Date;
    replyTo?: {
      id: string;
      senderRole: MessageSenderRole;
      content: string;
    } | null;
  }): ChatMessageDto {
    return new ChatMessageDto({
      id: msg.id,
      conversationId: msg.conversationId,
      senderRole: msg.senderRole as 'USER' | 'BOT',
      content: msg.content,
      buttons: toButtons(msg.buttons),
      channel: msg.channel ?? null,
      botName: msg.botName ?? null,
      operatorEmail: msg.operatorEmail ?? null,
      replyTo: msg.replyTo
        ? new MessageQuoteDto({
            id: msg.replyTo.id,
            senderRole: msg.replyTo.senderRole as 'USER' | 'BOT',
            content: msg.replyTo.content,
          })
        : null,
      deliveredTo: deriveDeliveredTo(
        msg.channel ?? null,
        msg.senderRole as 'USER' | 'BOT',
      ),
      readAt: msg.readAt?.toISOString() ?? null,
      createdAt: msg.createdAt.toISOString(),
    });
  }

  /**
   * Enriches a stream event with the userId by looking up the conversation.
   * This is called asynchronously after the event is published.
   */
  async enrichStreamEventWithUserId(
    event: MockBotStreamEventDto,
  ): Promise<MockBotStreamEventDto> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: event.conversationId },
      select: { userId: true },
    });

    if (conversation) {
      event.userId = conversation.userId;
    }

    return event;
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength - 1) + '…';
  }
}
