import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MessageChannelService } from './message-channel.service.js';

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
});
