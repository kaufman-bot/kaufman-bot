import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Delivery snapshot persisted on a BOT reply (design D2): where the reply
 * actually reached the user at write time, and which Telegram bot carried it.
 */
export interface DeliverySnapshot {
  channel: 'WEB' | 'TELEGRAM';
  botName: string | null;
}

/** Owner fields the delivery decision depends on. */
export interface DeliveryOwner {
  telegramBotId: string | null;
  telegramChatId: string | null;
}

/**
 * Channels a message was delivered to, derived from the persisted channel
 * snapshot (design D5, never stored): a USER message carries the single
 * channel it was written from; a BOT reply snapshot of TELEGRAM means the
 * reply reached both web and Telegram, anything else means web-only.
 */
export function deriveDeliveredTo(
  channel: 'WEB' | 'TELEGRAM' | null | undefined,
  senderRole: 'USER' | 'BOT',
): Array<'WEB' | 'TELEGRAM'> {
  if (senderRole === 'USER') {
    return channel === 'TELEGRAM' ? ['TELEGRAM'] : ['WEB'];
  }
  return channel === 'TELEGRAM' ? ['WEB', 'TELEGRAM'] : ['WEB'];
}

/**
 * Resolves the transport channel a BOT reply is delivered through, using the
 * exact gate the Telegram bridge applies when forwarding outgoing events:
 * the owner is bound to a bot (`telegramBotId`), has a chat id
 * (`telegramChatId`) and the bot is active. Any missing/disabled condition
 * means the reply only lands in the web chat (mock target).
 *
 * The delivery context (design D3) is the channel of the message the reply
 * responds to: a quoted reply follows the quoted message's channel, a plugin
 * reply follows its trigger's channel, a plain reply follows the last USER
 * message. Only a TELEGRAM context with an active binding delivers to
 * Telegram; a WEB context stays web-only even when the binding is active;
 * a null context (no user messages at all) falls back to the binding itself.
 *
 * This service is the single source of the "delivered to Telegram?" decision,
 * so persisted snapshots and actual bridge deliveries cannot drift apart.
 */
@Injectable()
export class MessageChannelService {
  constructor(private readonly prisma: PrismaService) {}

  /** Legacy form: the owner's active binding IS the delivery context. */
  async resolveDelivery(owner: DeliveryOwner | null): Promise<DeliverySnapshot>;
  /**
   * Context form (design D3): `contextChannel` is the channel of the message
   * the reply responds to; null falls back to the binding.
   */
  async resolveDelivery(
    contextChannel: 'WEB' | 'TELEGRAM' | null,
    owner: DeliveryOwner | null,
  ): Promise<DeliverySnapshot>;
  async resolveDelivery(
    contextChannelOrOwner: 'WEB' | 'TELEGRAM' | null | DeliveryOwner | null,
    maybeOwner?: DeliveryOwner | null,
  ): Promise<DeliverySnapshot> {
    const owner =
      maybeOwner !== undefined
        ? maybeOwner
        : (contextChannelOrOwner as DeliveryOwner | null);
    const contextChannel =
      maybeOwner !== undefined
        ? (contextChannelOrOwner as 'WEB' | 'TELEGRAM' | null)
        : null;

    if (!owner?.telegramBotId || !owner.telegramChatId) {
      return { channel: 'WEB', botName: null };
    }

    const bot = await this.prisma.telegramBot.findUnique({
      where: { id: owner.telegramBotId },
      select: { isActive: true, name: true },
    });
    if (!bot?.isActive) {
      return { channel: 'WEB', botName: null };
    }

    // Explicit non-Telegram context: web-only even though the binding is
    // active (the user is bound but wrote/receives this thread from the web).
    if (contextChannel !== null && contextChannel !== 'TELEGRAM') {
      return { channel: 'WEB', botName: null };
    }

    return { channel: 'TELEGRAM', botName: bot.name };
  }
}
