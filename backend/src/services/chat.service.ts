import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ChatMessageDto, ChatStreamEventDto } from '../dto/chat.dto.js';
import type { User } from '../generated/prisma/client.js';
import { MessageSenderRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatEvent, ChatEventsService } from './chat-events.service.js';

/** Maximum length of a message content after trimming. */
const MAX_CONTENT_LENGTH = 4000;

/**
 * User-side chat use cases: retrieve conversation history, send messages,
 * and stream real-time events. The conversation is created lazily on the
 * first message from the user.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatEvents: ChatEventsService,
  ) {}

  /**
   * Returns the full message history for the authenticated user's
   * conversation, ordered by creation time ascending. Marks all bot
   * messages as read (the user is viewing them). Returns an empty array
   * when no conversation exists yet.
   */
  async getHistory(user: User): Promise<ChatMessageDto[]> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { userId: user.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      return [];
    }

    // Mark all bot messages as read (user is viewing the history)
    await this.prisma.message.updateMany({
      where: {
        conversationId: conversation.id,
        senderRole: MessageSenderRole.BOT,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return conversation.messages.map((msg) => this.toDto(msg));
  }

  /**
   * Sends a message on behalf of the authenticated user. Creates the
   * conversation lazily if it does not exist yet. Returns the persisted
   * message and publishes a real-time event.
   */
  async sendMessage(user: User, content: string): Promise<ChatMessageDto> {
    const trimmed = typeof content === 'string' ? content.trim() : '';
    if (!trimmed) {
      throw new BadRequestException('Message content cannot be empty');
    }
    if (trimmed.length > MAX_CONTENT_LENGTH) {
      throw new BadRequestException(
        `Message content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`,
      );
    }

    // Lazy conversation creation: upsert ensures idempotency
    const conversation = await this.prisma.conversation.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderRole: MessageSenderRole.USER,
        content: trimmed,
      },
    });

    const dto = this.toDto(message);
    this.publishEvent(conversation.id, message, dto.createdAt);

    return dto;
  }

  /**
   * Returns an Observable that emits real-time chat events for the
   * authenticated user's conversation. The observable is filtered to
   * only include events for the user's conversation.
   */
  streamEvents(user: User): Observable<ChatStreamEventDto> {
    return new Observable<ChatStreamEventDto>((subscriber) => {
      // First, resolve the user's conversation (may not exist yet)
      this.prisma.conversation
        .findUnique({ where: { userId: user.id } })
        .then((conversation) => {
          if (!conversation) {
            // No conversation yet; subscribe to all events and filter
            // for when a conversation is created for this user
            const sub = this.chatEvents.streamAll().subscribe({
              next: (event) => {
                // Check if this event is for a conversation that belongs to this user
                this.prisma.conversation
                  .findUnique({ where: { id: event.conversationId } })
                  .then((conv) => {
                    if (conv && conv.userId === user.id) {
                      subscriber.next(this.toStreamEvent(event));
                    }
                  });
              },
              error: (err) => subscriber.error(err),
              complete: () => subscriber.complete(),
            });
            return () => sub.unsubscribe();
          }

          // Conversation exists; subscribe to its events
          const sub = this.chatEvents
            .streamByConversation(conversation.id)
            .subscribe({
              next: (event) => subscriber.next(this.toStreamEvent(event)),
              error: (err) => subscriber.error(err),
              complete: () => subscriber.complete(),
            });
          return () => sub.unsubscribe();
        })
        .catch((err) => subscriber.error(err));
    });
  }

  /**
   * Retrieves a conversation by user ID. Throws NotFoundException if the
   * conversation does not exist. Used by MockBotService to validate that
   * the target user has a conversation.
   */
  async getConversationByUserId(userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { userId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found for this user');
    }
    return conversation;
  }

  private toDto(message: {
    id: string;
    conversationId: string;
    senderRole: MessageSenderRole;
    content: string;
    readAt: Date | null;
    createdAt: Date;
  }): ChatMessageDto {
    return new ChatMessageDto({
      id: message.id,
      conversationId: message.conversationId,
      senderRole: message.senderRole,
      content: message.content,
      readAt: message.readAt?.toISOString() ?? null,
      createdAt: message.createdAt.toISOString(),
    });
  }

  private toStreamEvent(event: ChatEvent): ChatStreamEventDto {
    return new ChatStreamEventDto({
      messageId: event.messageId,
      conversationId: event.conversationId,
      senderRole: event.senderRole,
      content: event.content,
      createdAt: event.createdAt,
    });
  }

  private publishEvent(
    conversationId: string,
    message: {
      id: string;
      senderRole: MessageSenderRole;
      content: string;
      createdAt: Date;
    },
    createdAtIso: string,
  ): void {
    const event: ChatEvent = {
      conversationId,
      messageId: message.id,
      senderRole: message.senderRole,
      content: message.content,
      createdAt: createdAtIso,
    };
    this.chatEvents.publish(event);
  }
}
