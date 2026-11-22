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
 * Resolves the transport channel a BOT reply is delivered through, using the
 * exact gate the Telegram bridge applies when forwarding outgoing events:
 * the owner is bound to a bot (`telegramBotId`), has a chat id
 * (`telegramChatId`) and the bot is active. Any missing/disabled condition
 * means the reply only lands in the web chat (mock target).
 *
 * This service is the single source of the "delivered to Telegram?" decision,
 * so persisted snapshots and actual bridge deliveries cannot drift apart.
 */
@Injectable()
export class MessageChannelService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveDelivery(
    owner: DeliveryOwner | null,
  ): Promise<DeliverySnapshot> {
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

    return { channel: 'TELEGRAM', botName: bot.name };
  }
}
