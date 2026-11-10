import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import {
  ButtonCallbackRequestDto,
  ChatMessageDto,
  ChatStreamEventDto,
} from '../dto/chat.dto.js';
import type { Message, User } from '../generated/prisma/client.js';
import { MessageKind, MessageSenderRole } from '../generated/prisma/enums.js';
import type { BotPluginSourceKind } from '../plugins/bot-plugin.interface.js';
import { BotPluginsService } from '../plugins/bot-plugins.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MAX_CALLBACK_LENGTH, toButtons } from '../utils/keyboard-buttons.js';
import { ChatEvent, ChatEventsService } from './chat-events.service.js';

/** Maximum length of a message content after trimming. */
const MAX_CONTENT_LENGTH = 4000;

/**
 * User-side chat use cases: retrieve conversation history, send messages,
 * handle button callbacks, and stream real-time events. The conversation
 * is created lazily on the first message from the user. Every regular user
 * text message is dispatched to the bot plugins (outbox task); button
 * callbacks deliberately bypass that pipeline so a click never triggers an
 * automatic bot reply, and are filtered out of the user's own history and
 * SSE stream so the click does not echo back to them (see specs/user-chat).
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatEvents: ChatEventsService,
    private readonly botPlugins: BotPluginsService,
  ) {}

  /**
   * Returns the message history for the authenticated user's conversation,
   * ordered by creation time ascending. Callback messages (`kind=BUTTON`)
   * are excluded so the user never sees their own button clicks echoed
   * back. Marks all bot messages as read (the user is viewing them).
   * Returns an empty array when no conversation exists yet.
   */
  async getHistory(user: User): Promise<ChatMessageDto[]> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { userId: user.id },
      include: {
        messages: {
          where: { kind: { not: MessageKind.BUTTON } },
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
   * conversation lazily if it does not exist yet. The message and its
   * plugin-dispatch task are persisted atomically (see BotPluginTask).
   * Returns the persisted message and publishes a real-time event.
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

    // Atomic acceptance: the message and its plugin-dispatch task are
    // created in one transaction, so a crash or a DB failure can never leave
    // a persisted message without its outbox task — the task is what
    // guarantees the plugin processing is finished (or retried) across
    // server restarts.
    const message = await this.createMessageWithTask({
      conversationId: conversation.id,
      senderRole: MessageSenderRole.USER,
      kind: MessageKind.TEXT,
      content: trimmed,
    });

    const dto = this.toDto(message);
    this.publishEvent(conversation.id, message, dto.createdAt, 'TEXT');
    await this.dispatchToPlugins(conversation.id, user, trimmed, message.id);

    return dto;
  }

  /**
   * Handles a user pressing an inline keyboard button on a bot message.
   * Persists the payload as a USER message with `kind=BUTTON` — the
   * operator sees it in the console, the clicking user does NOT (see
   * `getHistory` and `streamEvents` filters).
   *
   * The click is dispatched to the plugins like any other user message, but
   * only plugins that declared `handlesCallbacks` are offered it, so a
   * payload colliding with a text-only trigger (e.g. `ping`) still produces
   * no reply. The reply — if any — arrives as a separate BOT event, which is
   * why this response stays the quiet callback DTO the frontend ignores.
   */
  async submitButtonCallback(
    user: User,
    dto: ButtonCallbackRequestDto,
  ): Promise<ChatMessageDto> {
    const callbackData =
      typeof dto?.callbackData === 'string' ? dto.callbackData.trim() : '';
    if (!callbackData) {
      throw new BadRequestException('callbackData cannot be empty');
    }
    if (callbackData.length > MAX_CALLBACK_LENGTH) {
      throw new BadRequestException(
        `callbackData exceeds maximum length of ${MAX_CALLBACK_LENGTH} characters`,
      );
    }

    const conversation = await this.prisma.conversation.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    // The click and its processing task are committed together, so a crash
    // right after this point still leaves the recovery sweep able to deliver
    // the plugin reply (same invariant as a typed message).
    const message = await this.createMessageWithTask({
      conversationId: conversation.id,
      senderRole: MessageSenderRole.USER,
      kind: MessageKind.BUTTON,
      content: callbackData,
    });

    const dtoResult = this.toDto(message);

    // Publish with kind=BUTTON; ChatController#streamEvents filters these
    // out before they reach the clicking user, but MockBotController's
    // streamAll keeps them so the console sees the click live.
    const event: ChatEvent = {
      conversationId: conversation.id,
      messageId: message.id,
      senderRole: MessageSenderRole.USER,
      content: message.content,
      createdAt: dtoResult.createdAt,
      kind: 'BUTTON',
      buttons: null,
    };
    this.chatEvents.publish(event);

    await this.dispatchToPlugins(
      conversation.id,
      user,
      callbackData,
      message.id,
      'BUTTON',
    );

    return dtoResult;
  }

  /**
   * Persists an inbound user message (typed text or a button payload)
   * together with the `BotPluginTask` that guards its processing, in a single
   * transaction. Used by both `sendMessage` and `submitButtonCallback` so the
   * outbox invariant cannot be satisfied by one path and missed by the other.
   */
  private async createMessageWithTask(data: {
    conversationId: string;
    senderRole: MessageSenderRole;
    kind: MessageKind;
    content: string;
  }): Promise<Message> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({ data });
      await tx.botPluginTask.create({ data: { messageId: created.id } });
      return created;
    });
  }

  /**
   * Returns an Observable that emits real-time chat events for the
   * authenticated user's conversation. Callback (kind=BUTTON) events are
   * filtered out so the user never sees their own click echoed back.
   */
  streamEvents(user: User): Observable<ChatStreamEventDto> {
    return new Observable<ChatStreamEventDto>((subscriber) => {
      // Suppress BUTTON events for the user's own stream. Centralised here
      // so both subscribe branches (conversation resolved eagerly vs lazily)
      // share the same suppression rule.
      const emitIfVisible = (event: ChatEvent): void => {
        if (event.kind === 'BUTTON') {
          return;
        }
        subscriber.next(this.toStreamEvent(event));
      };

      // First, resolve the user's conversation (may not exist yet)
      this.prisma.conversation
        .findUnique({ where: { userId: user.id } })
        .then((conversation) => {
          if (!conversation) {
            // No conversation yet; subscribe to all events and filter
            // for when a conversation is created for this user
            const sub = this.chatEvents
              .streamAll()
              .pipe(filter(() => true))
              .subscribe({
                next: (event) => {
                  // Check if this event is for a conversation that belongs to this user
                  this.prisma.conversation
                    .findUnique({ where: { id: event.conversationId } })
                    .then((conv) => {
                      if (conv && conv.userId === user.id) {
                        emitIfVisible(event);
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
              next: (event) => emitIfVisible(event),
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

  /**
   * Passes a persisted user message to the plugin dispatcher. A dispatcher
   * failure (including a failed bot-reply persistence) must never fail the
   * user's own send: it is logged and the send response stays successful.
   */
  private async dispatchToPlugins(
    conversationId: string,
    user: User,
    content: string,
    messageId: string,
    kind: BotPluginSourceKind = 'TEXT',
  ): Promise<void> {
    try {
      await this.botPlugins.dispatchAndReply(
        conversationId,
        user,
        content,
        messageId,
        kind,
      );
    } catch (error) {
      this.logger.error(
        `Bot plugins dispatch failed for conversation ${conversationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private toDto(message: {
    id: string;
    conversationId: string;
    senderRole: MessageSenderRole;
    content: string;
    buttons?: unknown;
    readAt: Date | null;
    createdAt: Date;
  }): ChatMessageDto {
    return new ChatMessageDto({
      id: message.id,
      conversationId: message.conversationId,
      senderRole: message.senderRole,
      content: message.content,
      buttons: toButtons(message.buttons),
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
      buttons: event.buttons ?? null,
      createdAt: event.createdAt,
    });
  }

  private publishEvent(
    conversationId: string,
    message: {
      id: string;
      senderRole: MessageSenderRole;
      content: string;
      buttons?: unknown;
      createdAt: Date;
    },
    createdAtIso: string,
    kind: 'TEXT' | 'BUTTON' = 'TEXT',
  ): void {
    const event: ChatEvent = {
      conversationId,
      messageId: message.id,
      senderRole: message.senderRole,
      content: message.content,
      createdAt: createdAtIso,
      kind,
      buttons: toButtons(message.buttons),
    };
    this.chatEvents.publish(event);
  }
}
