import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  deriveDeliveredTo,
  MessageChannelService,
} from './message-channel.service.js';

const makePrismaMock = () => {
  const telegramBotFindUnique = vi.fn();
  return {
    instance: {
      telegramBot: { findUnique: telegramBotFindUnique },
    },
    telegramBotFindUnique,
  };
};

describe('MessageChannelService', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let service: MessageChannelService;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    service = new MessageChannelService(
      prismaMock.instance as unknown as PrismaService,
    );
  });

  it('resolves WEB when the owner is null', async () => {
    await expect(service.resolveDelivery(null)).resolves.toEqual({
      channel: 'WEB',
      botName: null,
    });
    expect(prismaMock.telegramBotFindUnique).not.toHaveBeenCalled();
  });

  it('resolves WEB when the owner has no Telegram bot', async () => {
    await expect(
      service.resolveDelivery({ telegramBotId: null, telegramChatId: '999' }),
    ).resolves.toEqual({ channel: 'WEB', botName: null });
    expect(prismaMock.telegramBotFindUnique).not.toHaveBeenCalled();
  });

  it('resolves WEB when the owner has no Telegram chat id', async () => {
    await expect(
      service.resolveDelivery({ telegramBotId: 'bot-1', telegramChatId: null }),
    ).resolves.toEqual({ channel: 'WEB', botName: null });
    expect(prismaMock.telegramBotFindUnique).not.toHaveBeenCalled();
  });

  it('resolves WEB when the bound bot row no longer exists', async () => {
    prismaMock.telegramBotFindUnique.mockResolvedValue(null);

    await expect(
      service.resolveDelivery({
        telegramBotId: 'bot-1',
        telegramChatId: '999',
      }),
    ).resolves.toEqual({ channel: 'WEB', botName: null });
  });

  it('resolves WEB when the bound bot is inactive (bridge would skip it)', async () => {
    prismaMock.telegramBotFindUnique.mockResolvedValue({
      isActive: false,
      name: 'Kaufman Bot',
    });

    await expect(
      service.resolveDelivery({
        telegramBotId: 'bot-1',
        telegramChatId: '999',
      }),
    ).resolves.toEqual({ channel: 'WEB', botName: null });
  });

  it('resolves TELEGRAM with the bot name when the bot is active', async () => {
    prismaMock.telegramBotFindUnique.mockResolvedValue({
      isActive: true,
      name: 'Kaufman Bot',
    });

    await expect(
      service.resolveDelivery({
        telegramBotId: 'bot-1',
        telegramChatId: '999',
      }),
    ).resolves.toEqual({ channel: 'TELEGRAM', botName: 'Kaufman Bot' });
    expect(prismaMock.telegramBotFindUnique).toHaveBeenCalledWith({
      where: { id: 'bot-1' },
      select: { isActive: true, name: true },
    });
  });

  describe('explicit context channel (design D3)', () => {
    const boundOwner = {
      telegramBotId: 'bot-1',
      telegramChatId: '999',
    };

    beforeEach(() => {
      prismaMock.telegramBotFindUnique.mockResolvedValue({
        isActive: true,
        name: 'Kaufman Bot',
      });
    });

    it('a WEB context stays web-only even when the binding is active', async () => {
      await expect(service.resolveDelivery('WEB', boundOwner)).resolves.toEqual(
        { channel: 'WEB', botName: null },
      );
    });

    it('a TELEGRAM context with an active binding delivers to Telegram', async () => {
      await expect(
        service.resolveDelivery('TELEGRAM', boundOwner),
      ).resolves.toEqual({ channel: 'TELEGRAM', botName: 'Kaufman Bot' });
    });

    it('a null context falls back to the binding itself', async () => {
      await expect(service.resolveDelivery(null, boundOwner)).resolves.toEqual({
        channel: 'TELEGRAM',
        botName: 'Kaufman Bot',
      });
    });

    it('a WEB context resolves to WEB even when the bot is inactive', async () => {
      prismaMock.telegramBotFindUnique.mockResolvedValue({
        isActive: false,
        name: 'Kaufman Bot',
      });

      await expect(service.resolveDelivery('WEB', boundOwner)).resolves.toEqual(
        { channel: 'WEB', botName: null },
      );
    });

    it('a TELEGRAM context without a binding stays web-only', async () => {
      await expect(
        service.resolveDelivery('TELEGRAM', {
          telegramBotId: null,
          telegramChatId: null,
        }),
      ).resolves.toEqual({ channel: 'WEB', botName: null });
      expect(prismaMock.telegramBotFindUnique).not.toHaveBeenCalled();
    });
  });

  describe('deriveDeliveredTo', () => {
    it('maps a USER message to the single channel it was written from', () => {
      expect(deriveDeliveredTo('TELEGRAM', 'USER')).toEqual(['TELEGRAM']);
      expect(deriveDeliveredTo('WEB', 'USER')).toEqual(['WEB']);
      expect(deriveDeliveredTo(null, 'USER')).toEqual(['WEB']);
    });

    it('maps a BOT reply snapshot TELEGRAM to dual delivery', () => {
      expect(deriveDeliveredTo('TELEGRAM', 'BOT')).toEqual(['WEB', 'TELEGRAM']);
      expect(deriveDeliveredTo('WEB', 'BOT')).toEqual(['WEB']);
      expect(deriveDeliveredTo(null, 'BOT')).toEqual(['WEB']);
    });
  });
});
