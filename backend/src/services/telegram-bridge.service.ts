import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Bot, InlineKeyboard } from 'grammy';
import type { Update } from 'grammy/types';
import { Subscription } from 'rxjs';
import { KeyboardButtonDto } from '../dto/keyboard.dto.js';
import type { TelegramSender } from '../interfaces/telegram-sender.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ChatEvent } from './chat-events.service.js';
import { ChatEventsService } from './chat-events.service.js';
import { ChatService } from './chat.service.js';
import { TelegramBindingService } from './telegram-binding.service.js';

/** Telegram's hard limit on `callback_data` (bytes). */
const TG_CALLBACK_DATA_MAX_BYTES = 64;

/** Builds a Telegram inline keyboard from plugin/operator buttons. */
function buildInlineKeyboard(
  buttons?: KeyboardButtonDto[],
): InlineKeyboard | undefined {
  if (!buttons?.length) return undefined;
  const markup = new InlineKeyboard();
  for (const btn of buttons) {
    markup.text(btn.title, btn.callbackData).row();
  }
  return markup;
}

/**
 * Infrastructure service that bridges the internal chat engine and the
 * Telegram Bot API. Handles both directions:
 *
 * - **Outgoing**: subscribes to `ChatEventsService.streamAll()` and forwards
 *   BOT messages whose channel snapshot is `TELEGRAM` (design D3 — the
 *   delivery decision is made by `resolveDelivery` when the reply is
 *   persisted, the bridge only honors the snapshot) to the appropriate
 *   Telegram chat when the user is bound and the bot is active. A reply
 *   quoting a Telegram message additionally carries `reply_to_message_id`,
 *   with a one-shot fallback without the reference when Telegram rejects it.
 *   After a successful send the Telegram `message_id` is stored on the
 *   message row; an `edited` event (design D12) is delivered in place via
 *   `editMessageText` using that stored id, falling back to a new message
 *   (with id backfill) when no id is known or Telegram rejects the edit.
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
        void this.forwardOutgoing(event);
      }
    });
  }

  // ─── Outgoing (BOT → Telegram) ─────────────────────────────────────────────

  /**
   * Resolves the conversation → user → bot and sends via the sender. Only
   * proceeds when the event's channel snapshot is `TELEGRAM` and the user has
   * a bot target that is active and a non-empty telegramChatId. When the
   * reply quotes a Telegram message, it is sent with `reply_to_message_id`;
   * if Telegram rejects the reference, the text is resent once without it
   * (best effort) so the reply is still delivered.
   */
  private async forwardOutgoing(event: ChatEvent): Promise<void> {
    // Delivery gate (design D3): events with any other snapshot (WEB or
    // legacy null) never reach Telegram, so the persisted snapshot and the
    // actual delivery cannot drift apart.
    if (event.channel !== 'TELEGRAM') return;

    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: event.conversationId },
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
      const tgButtons = event.buttons?.filter(
        (b) =>
          Buffer.byteLength(b.callbackData, 'utf-8') <=
          TG_CALLBACK_DATA_MAX_BYTES,
      );
      const buttons = tgButtons?.length ? tgButtons : undefined;

      // Edit-in-place (design D12): an `edited` event rewrites an already
      // delivered Telegram message instead of appending a new one. Without a
      // stored id (never delivered, or delivery failed earlier) — or when
      // Telegram rejects the edit — the regular new-message path below runs
      // as the fallback and backfills the fresh id.
      if (event.edited === true) {
        const row = await this.prisma.message.findUnique({
          where: { id: event.messageId },
          select: { telegramMessageId: true },
        });
        const tgMessageId = row?.telegramMessageId ?? undefined;
        if (tgMessageId !== undefined) {
          try {
            await sender.editMessageText(
              telegramChatId,
              tgMessageId,
              event.content,
              buttons,
            );
            // The Telegram message_id is unchanged by an edit.
            return;
          } catch (err) {
            this.logger.warn(
              `In-place edit of Telegram message ${tgMessageId} failed (${String(err)}); falling back to a new message`,
            );
          }
        }
      }

      const replyToMessageId = event.replyTo?.telegramMessageId ?? undefined;
      if (replyToMessageId !== undefined) {
        try {
          const sentId = await sender.sendMessage(
            telegramChatId,
            event.content,
            buttons,
            replyToMessageId,
          );
          await this.backfillTelegramMessageId(event.messageId, sentId);
          return;
        } catch (err) {
          // One-shot fallback: Telegram rejects reply_to_message_id when the
          // referenced message is gone or inaccessible — resend without the
          // reference so the reply is still delivered (best effort).
          this.logger.warn(
            `Outgoing forward with reply_to_message_id failed (${String(err)}); retrying without the reply reference`,
          );
        }
      }

      const sentId = await sender.sendMessage(
        telegramChatId,
        event.content,
        buttons,
      );
      await this.backfillTelegramMessageId(event.messageId, sentId);
    } catch (err) {
      this.logger.error(`Outgoing forward failed: ${String(err)}`);
    }
  }

  /**
   * Stores the Telegram `message_id` of a delivered BOT message on its row
   * (best effort): the id enables later in-place edits (design D12). A lost
   * id only disables those edits, so a failure stays a warning.
   */
  private async backfillTelegramMessageId(
    messageId: string,
    telegramMessageId: number | null,
  ): Promise<void> {
    if (!telegramMessageId) return;
    try {
      await this.prisma.message.update({
        where: { id: messageId },
        data: { telegramMessageId },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to store telegramMessageId for message ${messageId}: ${String(err)}`,
      );
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
      select: {
        id: true,
        webhookSecret: true,
        isActive: true,
        botToken: true,
        name: true,
      },
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
      await this.handleMessage(botId, update, bot.botToken, bot.name);
    } else if (update.callback_query) {
      await this.handleCallbackQuery(botId, update, bot.botToken, bot.name);
    }

    return true;
  }

  private async handleMessage(
    botId: string,
    update: Update,
    botToken: string,
    botName: string,
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
      .sendMessage(user, text, {
        channel: 'TELEGRAM',
        botName,
        telegramMessageId: message.message_id,
      })
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
    botName: string,
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
      .submitButtonCallback(user, { callbackData: data } as any, {
        channel: 'TELEGRAM',
        botName,
        // Snapshot exists only when the original message is still available
        // in the update (it may be an inaccessible message).
        telegramMessageId: cq.message?.message_id ?? null,
      })
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
        replyToMessageId?: number,
      ): Promise<number | null> {
        const reply_markup = buildInlineKeyboard(buttons);
        const options: {
          reply_markup?: InlineKeyboard;
          reply_to_message_id?: number;
        } = {};
        if (reply_markup) {
          options.reply_markup = reply_markup;
        }
        if (replyToMessageId !== undefined) {
          options.reply_to_message_id = replyToMessageId;
        }
        const sent = await bot.api.sendMessage(
          chatId,
          text,
          Object.keys(options).length ? options : undefined,
        );
        return sent.message_id;
      },
      async editMessageText(
        chatId: string,
        telegramMessageId: number,
        text: string,
        buttons?: KeyboardButtonDto[],
      ): Promise<void> {
        const reply_markup = buildInlineKeyboard(buttons);
        const options: { reply_markup?: InlineKeyboard } = {};
        if (reply_markup) {
          options.reply_markup = reply_markup;
        }
        await bot.api.editMessageText(
          chatId,
          telegramMessageId,
          text,
          Object.keys(options).length ? options : undefined,
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
