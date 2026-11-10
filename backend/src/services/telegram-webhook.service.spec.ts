import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramWebhookService } from './telegram-webhook.service.js';

const makePrismaMock = () => {
  const findMany = vi.fn();
  const findUnique = vi.fn();

  return {
    instance: {
      telegramBot: { findMany, findUnique },
    } as any,
    findMany,
    findUnique,
  };
};

/**
 * Creates a fake grammy Bot object with mocked api methods.
 * We replace `createBot` (the factory method) on the service instance.
 */
function createFakeBot() {
  return {
    api: {
      setWebhook: vi.fn().mockResolvedValue(true),
      deleteWebhook: vi.fn().mockResolvedValue(true),
    },
  };
}

describe('TelegramWebhookService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: TelegramWebhookService;
  let fakeBot: ReturnType<typeof createFakeBot>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    service = new TelegramWebhookService(prisma.instance);
    fakeBot = createFakeBot();
    // Override the protected createBot method
    vi.spyOn(
      service as unknown as { createBot: (token: string) => unknown },
      'createBot',
    ).mockReturnValue(fakeBot);
  });

  describe('onApplicationBootstrap', () => {
    it('warns and skips when TELEGRAM_WEBHOOK_BASE_URL is empty', async () => {
      delete process.env.TELEGRAM_WEBHOOK_BASE_URL;

      await service.onApplicationBootstrap();

      expect(prisma.findMany).not.toHaveBeenCalled();
    });

    it('warns and skips when base URL is empty string', async () => {
      process.env.TELEGRAM_WEBHOOK_BASE_URL = '';

      await service.onApplicationBootstrap();

      expect(prisma.findMany).not.toHaveBeenCalled();
    });

    it('queries active bots and attempts setWebhook for each', async () => {
      process.env.TELEGRAM_WEBHOOK_BASE_URL = 'https://example.com';
      prisma.findMany.mockResolvedValue([
        { id: 'bot-1', botToken: 'token-1', webhookSecret: 'secret-1' },
      ]);
      prisma.findUnique.mockResolvedValue({
        botToken: 'token-1',
        webhookSecret: 'secret-1',
        isActive: true,
      });

      await service.onApplicationBootstrap();

      expect(prisma.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        select: { id: true, botToken: true, webhookSecret: true },
      });
      // Give fire-and-forget microtasks time to settle
      await vi.waitFor(() => {
        expect(fakeBot.api.setWebhook).toHaveBeenCalled();
      });
    });
  });

  describe('syncById', () => {
    it('calls setWebhook when bot is active', async () => {
      process.env.TELEGRAM_WEBHOOK_BASE_URL = 'https://example.com';
      prisma.findUnique.mockResolvedValue({
        botToken: 'token-abc',
        webhookSecret: 'secret-xyz',
        isActive: true,
      });

      await service.syncById('bot-1');

      expect(prisma.findUnique).toHaveBeenCalledWith({
        where: { id: 'bot-1' },
        select: { botToken: true, webhookSecret: true, isActive: true },
      });
      expect(fakeBot.api.setWebhook).toHaveBeenCalledWith(
        'https://example.com/api/telegram/webhook/bot-1',
        { secret_token: 'secret-xyz' },
      );
    });

    it('calls deleteWebhook when bot is inactive', async () => {
      process.env.TELEGRAM_WEBHOOK_BASE_URL = 'https://example.com';
      prisma.findUnique.mockResolvedValue({
        botToken: 'token-abc',
        webhookSecret: 'secret-xyz',
        isActive: false,
      });

      await service.syncById('bot-1');

      expect(fakeBot.api.deleteWebhook).toHaveBeenCalled();
      expect(fakeBot.api.setWebhook).not.toHaveBeenCalled();
    });

    it('skips silently when bot not found', async () => {
      process.env.TELEGRAM_WEBHOOK_BASE_URL = 'https://example.com';
      prisma.findUnique.mockResolvedValue(null);

      await service.syncById('bot-nonexistent');

      expect(fakeBot.api.setWebhook).not.toHaveBeenCalled();
      expect(fakeBot.api.deleteWebhook).not.toHaveBeenCalled();
    });

    it('swallows Telegram API errors (best-effort)', async () => {
      process.env.TELEGRAM_WEBHOOK_BASE_URL = 'https://example.com';
      prisma.findUnique.mockResolvedValue({
        botToken: 'token-abc',
        webhookSecret: 'secret-xyz',
        isActive: true,
      });
      fakeBot.api.setWebhook.mockRejectedValueOnce(
        new Error('Network timeout'),
      );

      // Should NOT throw
      await expect(service.syncById('bot-1')).resolves.toBeUndefined();
    });

    it('skips when base URL is not configured', async () => {
      delete process.env.TELEGRAM_WEBHOOK_BASE_URL;

      await service.syncById('bot-1');

      expect(prisma.findUnique).not.toHaveBeenCalled();
      expect(fakeBot.api.setWebhook).not.toHaveBeenCalled();
    });
  });

  describe('unregisterByToken', () => {
    it('calls deleteWebhook with the given token', async () => {
      process.env.TELEGRAM_WEBHOOK_BASE_URL = 'https://example.com';

      await service.unregisterByToken('some-token');

      expect(fakeBot.api.deleteWebhook).toHaveBeenCalled();
    });

    it('swallows errors (best-effort)', async () => {
      process.env.TELEGRAM_WEBHOOK_BASE_URL = 'https://example.com';
      fakeBot.api.deleteWebhook.mockRejectedValueOnce(
        new Error('401 Unauthorized'),
      );

      await expect(
        service.unregisterByToken('bad-token'),
      ).resolves.toBeUndefined();
    });

    it('skips when base URL is not configured', async () => {
      delete process.env.TELEGRAM_WEBHOOK_BASE_URL;

      await service.unregisterByToken('some-token');

      expect(fakeBot.api.deleteWebhook).not.toHaveBeenCalled();
    });
  });
});
