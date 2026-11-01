import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ChatMessageDto } from '../dto/chat.dto.js';
import {
  ConversationSummaryDto,
  MockBotStreamEventDto,
} from '../dto/mock-bot.dto.js';
import { MessageSenderRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatEvent, ChatEventsService } from './chat-events.service.js';

/** Maximum length of a reply content after trimming. */
const MAX_CONTENT_LENGTH = 4000;

/** Maximum length of the last message preview in conversation summary. */
const LAST_MESSAGE_PREVIEW_LENGTH = 100;

/**
 * Operator-side mock-bot console use cases: list conversations with unread
 * counts, read a specific user's messages, reply as the bot, and stream
 * real-time events from all users.
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
          readAt: msg.readAt?.toISOString() ?? null,
          createdAt: msg.createdAt.toISOString(),
        }),
    );
  }

  /**
   * Sends a reply on behalf of the bot to a specific user's conversation.
   * Creates the conversation if it does not exist yet (edge case: operator
   * replies before the user has sent any messages).
   */
  async replyAsBot(userId: string, content: string): Promise<ChatMessageDto> {
    const trimmed = typeof content === 'string' ? content.trim() : '';
    if (!trimmed) {
      throw new BadRequestException('Reply content cannot be empty');
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
        content: trimmed,
      },
    });

    const dto = new ChatMessageDto({
      id: message.id,
      conversationId: message.conversationId,
      senderRole: message.senderRole as 'USER' | 'BOT',
      content: message.content,
      readAt: message.readAt?.toISOString() ?? null,
      createdAt: message.createdAt.toISOString(),
    });

    // Publish event for real-time delivery
    const event: ChatEvent = {
      conversationId: conversation.id,
      messageId: message.id,
      senderRole: MessageSenderRole.BOT,
      content: trimmed,
      createdAt: dto.createdAt,
    };
    this.chatEvents.publish(event);

    return dto;
  }

  /**
   * Returns an Observable that emits real-time chat events from all
   * conversations. The mock-bot console uses this to stream messages
   * from all users without filtering.
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
