import type { KeyboardButtonDto } from '../dto/keyboard.dto.js';

/**
 * Narrow interface for sending messages and answering callbacks via a
 * Telegram Bot API implementation. In production the concrete class wraps a
 * grammY `Bot` instance; in unit tests it is replaced by a spy/mock.
 */
export interface TelegramSender {
  /**
   * Sends a text message to the given chat, optionally with inline keyboard
   * buttons and a reply reference. Buttons whose `callbackData` exceeds the
   * Telegram 64-byte limit should be filtered out before calling this method
   * (the caller is responsible for compliance). `replyToMessageId` maps to
   * the Telegram `reply_to_message_id` option, so the client renders the
   * message as a quote of the referenced one.
   *
   * Resolves with the Telegram `message_id` of the sent message (so the
   * caller can persist it for later in-place edits) or `null` when the API
   * response carries no usable id.
   */
  sendMessage(
    chatId: string,
    text: string,
    buttons?: KeyboardButtonDto[],
    replyToMessageId?: number,
  ): Promise<number | null>;

  /**
   * Rewrites the text and inline keyboard of an already sent message
   * (Telegram `editMessageText`). Throws when Telegram rejects the edit
   * (message deleted, inaccessible, or identical content) — the caller is
   * responsible for the new-message fallback with id backfill.
   */
  editMessageText(
    chatId: string,
    telegramMessageId: number,
    text: string,
    buttons?: KeyboardButtonDto[],
  ): Promise<void>;

  /**
   * Acknowledges an incoming callback query so Telegram removes the loading
   * spinner on the user's button press.
   */
  answerCallbackQuery(callbackQueryId: string): Promise<void>;
}
