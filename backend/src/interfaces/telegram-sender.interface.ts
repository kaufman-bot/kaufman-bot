import type { KeyboardButtonDto } from '../dto/keyboard.dto.js';

/**
 * Narrow interface for sending messages and answering callbacks via a
 * Telegram Bot API implementation. In production the concrete class wraps a
 * grammY `Bot` instance; in unit tests it is replaced by a spy/mock.
 */
export interface TelegramSender {
  /**
   * Sends a text message to the given chat, optionally with inline keyboard
   * buttons. Buttons whose `callbackData` exceeds the Telegram 64-byte limit
   * should be filtered out before calling this method (the caller is
   * responsible for compliance).
   */
  sendMessage(
    chatId: string,
    text: string,
    buttons?: KeyboardButtonDto[],
  ): Promise<void>;

  /**
   * Acknowledges an incoming callback query so Telegram removes the loading
   * spinner on the user's button press.
   */
  answerCallbackQuery(callbackQueryId: string): Promise<void>;
}
