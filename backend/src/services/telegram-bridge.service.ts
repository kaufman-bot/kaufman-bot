import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Bot, InlineKeyboard } from 'grammy';
import type { Update } from 'grammy/types';
import { Subscription } from 'rxjs';
import { KeyboardButtonDto } from '../dto/keyboard.dto.js';
import type { TelegramSender } from '../interfaces/telegram-sender.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatEventsService } from './chat-events.service.js';
import { ChatService } from './chat.service.js';
import { TelegramBindingService } from './telegram-binding.service.js';

/** Telegram's hard limit on `callback_data` (bytes). */
const TG_CALLBACK_DATA_MAX_BYTES = 64;

/**
 * Infrastructure service that bridges the internal chat engine and the
 * Telegram Bot API. Handles both directions:
 *
 * - **Outgoing**: subscribes to `ChatEventsService.streamAll()` and forwards
 *   BOT messages to the appropriate Telegram chat when the user is bound and
 *   the bot is active.
 * - **Incoming**: processes Telegram updates (text messages, `/start` binding,
 *   callback queries) by delegating to `ChatService` and `TelegramBindingService`.
 *
 * The service maintains a lazy registry of grammY `Bot` instances keyed by
 * `TelegramBot.id`, recreated on token change.
 */
@Injectable()
export class TelegramBridgeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramBridgeService.name);
  private subscription: Subscription | null = null;

  /** Lazy cache of sender instances, invalidated when token changes. */
  private readonly senders = new Map<
    string,
    { token: string; sender: TelegramSender }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatEvents: ChatEventsService,
    private readonly chatService: ChatService,
    private readonly bindingService: TelegramBindingService,
  ) {}

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  onApplicationBootstrap(): void {
    this.subscription = this.chatEvents.streamAll().subscribe((event) => {
      if (event.senderRole === 'BOT') {
        void this.forwardOutgoing(
          event.conversationId,
          event.content,
          event.buttons,
        );
      }
    });
  }

  // ─── Outgoing (BOT → Telegram) ─────────────────────────────────────────────

  /**
   * Resolves the conversation → user → bot and sends via the sender. Only
   * proceeds when the user has a bot target that is active and a non-empty
   * telegramChatId.
   */
  private async forwardOutgoing(
    conversationId: string,
    content: string,
    buttons?: KeyboardButtonDto[] | null,
  ): Promise<void> {
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          user: {
            select: { id: true, telegramBotId: true, telegramChatId: true },
          },
        },
      });
      if (!conversation?.user) return;

      const { telegramBotId, telegramChatId } = conversation.user;
      if (!telegramBotId || !telegramChatId) return;

      const bot = await this.prisma.telegramBot.findUnique({
        where: { id: telegramBotId },
        select: { id: true, isActive: true, botToken: true },
      });
      if (!bot || !bot.isActive) return;

      const sender = this.getOrCreateSender(bot.id, bot.botToken);

      // Filter out buttons that exceed Telegram's callback_data byte limit.
      const tgButtons = buttons?.filter(
        (b) =>
          Buffer.byteLength(b.callbackData, 'utf-8') <=
          TG_CALLBACK_DATA_MAX_BYTES,
      );

      await sender.sendMessage(
        telegramChatId,
        content,
        tgButtons?.length ? tgButtons : undefined,
      );
    } catch (err) {
      this.logger.error(`Outgoing forward failed: ${String(err)}`);
    }
  }

  // ─── Incoming (Telegram → internal) ────────────────────────────────────────

  /**
   * Processes a single Telegram update. Validates the webhook secret, then
   * dispatches to the appropriate handler.
   *
   * @returns true when the update was handled (or validly ignored), false
   *   when the secret did not match (caller should return 403).
   */
  async handleUpdate(
    botId: string,
    update: Update,
    secret: string | undefined,
  ): Promise<boolean> {
    const bot = await this.prisma.telegramBot.findUnique({
      where: { id: botId },
      select: { id: true, webhookSecret: true, isActive: true, botToken: true },
    });
    if (!bot) return false;

    // Secret validation.
    if (!secret || secret !== bot.webhookSecret) {
      this.logger.warn(`Webhook secret mismatch for bot ${botId}`);
      return false;
    }

    // Inactive bot — ignore all updates.
    if (!bot.isActive) return true;

    if (update.message?.text) {
      await this.handleMessage(botId, update, bot.botToken);
    } else if (update.callback_query) {
      await this.handleCallbackQuery(botId, update, bot.botToken);
    }

    return true;
  }

  private async handleMessage(
    botId: string,
    update: Update,
    botToken: string,
  ): Promise<void> {
    const message = update.message!;
    const text = message.text!;
    const chatId = String(message.chat.id);

    // /start <token> — binding flow.
    if (text.startsWith('/start ')) {
      const token = text.slice(7).trim();
      if (token) {
        const bound = await this.bindingService.consumeToken(token, chatId);
        const sender = this.getOrCreateSender(botId, botToken);
        const reply = bound
          ? '✅ Chat linked successfully!'
          : '⚠️ Invalid or expired token.';
        await sender
          .sendMessage(chatId, reply)
          .catch((err) =>
            this.logger.error(`Failed to send /start reply: ${String(err)}`),
          );
      }
      return;
    }

    // Regular text from a bound user.
    const user = await this.resolveUser(botId, chatId);
    if (!user) return;

    const sender = this.getOrCreateSender(botId, botToken);
    await this.chatService
      .sendMessage(user, text)
      .catch((err) =>
        this.logger.error(`Inbound text dispatch failed: ${String(err)}`),
      );
    // BOT reply goes out via the outgoing subscription.
    void sender; // sender used implicitly by the bridge's outgoing path
  }

  private async handleCallbackQuery(
    botId: string,
    update: Update,
    botToken: string,
  ): Promise<void> {
    const cq = update.callback_query!;
    const chatId = String(cq.message?.chat?.id ?? cq.from?.id ?? '');
    const data = cq.data ?? '';

    const user = await this.resolveUser(botId, chatId);
    if (!user) return;

    const sender = this.getOrCreateSender(botId, botToken);

    // Answer the callback query to remove the spinner.
    await sender.answerCallbackQuery(cq.id).catch(() => {});

    await this.chatService
      .submitButtonCallback(user, { callbackData: data } as any)
      .catch((err) =>
        this.logger.error(`Inbound callback dispatch failed: ${String(err)}`),
      );
  }

  /**
   * Finds a user bound to this bot with the given chatId.
   */
  private async resolveUser(botId: string, chatId: string) {
    const user = await this.prisma.user.findFirst({
      where: { telegramBotId: botId, telegramChatId: chatId },
    });
    return user;
  }

  // ─── Sender registry ───────────────────────────────────────────────────────

  /**
   * Returns a cached `TelegramSender` for the given bot, creating one if the
   * token has changed or no sender exists yet.
   */
  private getOrCreateSender(botId: string, token: string): TelegramSender {
    const cached = this.senders.get(botId);
    if (cached && cached.token === token) {
      return cached.sender;
    }

    const sender = this.createSender(token);
    this.senders.set(botId, { token, sender });
    return sender;
  }

  /**
   * Factory method (protected for testability). Creates a grammy-backed
   * `TelegramSender`.
   */
  protected createSender(token: string): TelegramSender {
    const bot = new Bot(token);
    return {
      async sendMessage(
        chatId: string,
        text: string,
        buttons?: KeyboardButtonDto[],
      ): Promise<void> {
        let reply_markup: InlineKeyboard | undefined;
        if (buttons?.length) {
          reply_markup = new InlineKeyboard();
          for (const btn of buttons) {
            reply_markup.text(btn.title, btn.callbackData).row();
          }
        }
        await bot.api.sendMessage(
          chatId,
          text,
          reply_markup ? { reply_markup } : undefined,
        );
      },
      async answerCallbackQuery(callbackQueryId: string): Promise<void> {
        await bot.api.answerCallbackQuery(callbackQueryId);
      },
    };
  }

  /**
   * Invalidates the cached sender for a bot (called when token changes).
   */
  invalidateSender(botId: string): void {
    this.senders.delete(botId);
  }
}
