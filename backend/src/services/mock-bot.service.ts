import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ChatMessageDto } from '../dto/chat.dto.js';
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
import { ChatEvent, ChatEventsService } from './chat-events.service.js';

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

    return conversation.messages.map(
      (msg) =>
        new ChatMessageDto({
          id: msg.id,
          conversationId: msg.conversationId,
          senderRole: msg.senderRole as 'USER' | 'BOT',
          content: msg.content,
          buttons: toButtons(msg.buttons),
          readAt: msg.readAt?.toISOString() ?? null,
          createdAt: msg.createdAt.toISOString(),
        }),
    );
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
   */
  async replyAsBot(
    userId: string,
    content: string | undefined,
    buttons?: KeyboardButtonDto[],
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

    // Ensure conversation exists (create lazily if needed)
    const conversation = await this.prisma.conversation.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderRole: MessageSenderRole.BOT,
        kind: MessageKind.TEXT,
        content: trimmed,
        buttons: normalizedButtons
          ? (normalizedButtons as unknown as object)
          : undefined,
      },
    });

    const dtoButtons = toButtons(message.buttons);
    const dto = new ChatMessageDto({
      id: message.id,
      conversationId: message.conversationId,
      senderRole: message.senderRole as 'USER' | 'BOT',
      content: message.content,
      buttons: dtoButtons,
      readAt: message.readAt?.toISOString() ?? null,
      createdAt: message.createdAt.toISOString(),
    });

    // Publish event for real-time delivery (kind=TEXT: this is a normal
    // bot reply, visible to both the operator console and the user).
    const event: ChatEvent = {
      conversationId: conversation.id,
      messageId: message.id,
      senderRole: MessageSenderRole.BOT,
      content: trimmed,
      createdAt: dto.createdAt,
      kind: 'TEXT',
      buttons: dtoButtons,
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
      createdAt: event.createdAt,
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
