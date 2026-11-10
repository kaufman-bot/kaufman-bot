import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramBindingService } from './telegram-binding.service.js';

const makePrismaMock = () => {
  const telegramBotFindFirst = vi.fn();
  const telegramBotFindUnique = vi.fn();
  const userFindUnique = vi.fn();
  const userUpdateMany = vi.fn();
  const userUpdate = vi.fn();
  const bindingTokenCreate = vi.fn();
  const bindingTokenFindUnique = vi.fn();
  const bindingTokenUpdate = vi.fn();
  const transaction = vi.fn();

  return {
    instance: {
      telegramBot: {
        findFirst: telegramBotFindFirst,
        findUnique: telegramBotFindUnique,
      },
      user: {
        findUnique: userFindUnique,
        updateMany: userUpdateMany,
        update: userUpdate,
      },
      telegramBindingToken: {
        create: bindingTokenCreate,
        findUnique: bindingTokenFindUnique,
        update: bindingTokenUpdate,
      },
      $transaction: transaction,
    } as any,
    telegramBotFindFirst,
    telegramBotFindUnique,
    userFindUnique,
    userUpdateMany,
    userUpdate,
    bindingTokenCreate,
    bindingTokenFindUnique,
    bindingTokenUpdate,
    transaction,
  };
};

describe('TelegramBindingService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: TelegramBindingService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    service = new TelegramBindingService(prisma.instance);
  });

  // ─── setTarget ─────────────────────────────────────────────────────────

  describe('setTarget', () => {
    it('assigns a valid bot owned by the admin', async () => {
      prisma.telegramBotFindFirst.mockResolvedValue({ id: 'bot-1' });
      prisma.userUpdateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.setTarget('admin-1', 'user-1', 'bot-1'),
      ).resolves.toBeUndefined();

      expect(prisma.telegramBotFindFirst).toHaveBeenCalledWith({
        where: { id: 'bot-1', ownerId: 'admin-1' },
        select: { id: true },
      });
      expect(prisma.userUpdateMany).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { telegramBotId: 'bot-1' },
      });
    });

    it('resets to mock-server when telegramBotId is null', async () => {
      prisma.userUpdateMany.mockResolvedValue({ count: 1 });

      await service.setTarget('admin-1', 'user-1', null);

      // No bot validation needed when resetting to mock.
      expect(prisma.telegramBotFindFirst).not.toHaveBeenCalled();
      expect(prisma.userUpdateMany).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { telegramBotId: null },
      });
    });

    it('throws NotFound when bot is foreign or missing', async () => {
      prisma.telegramBotFindFirst.mockResolvedValue(null);

      await expect(
        service.setTarget('admin-2', 'user-1', 'bot-of-admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when user does not exist', async () => {
      prisma.telegramBotFindFirst.mockResolvedValue({ id: 'bot-1' });
      prisma.userUpdateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.setTarget('admin-1', 'nonexistent', 'bot-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('never touches telegramChatId on target change (rebind only via /start)', async () => {
      prisma.telegramBotFindFirst.mockResolvedValue({ id: 'bot-2' });
      prisma.userUpdateMany.mockResolvedValue({ count: 1 });

      await service.setTarget('admin-1', 'user-1', 'bot-2');

      expect(prisma.userUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ telegramChatId: null }),
        }),
      );
      const data = prisma.userUpdateMany.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('telegramChatId');
    });
  });

  // ─── launch ────────────────────────────────────────────────────────────

  describe('launch', () => {
    it('creates a binding token and returns url+token', async () => {
      prisma.userFindUnique.mockResolvedValue({ telegramBotId: 'bot-1' });
      prisma.telegramBotFindUnique.mockResolvedValue({ botUsername: 'my_bot' });
      prisma.bindingTokenCreate.mockResolvedValue({});

      const result = await service.launch('user-1');

      expect(result.url).toMatch(/^https:\/\/t\.me\/my_bot\?start=/);
      expect(result.token).toBeDefined();
      expect(prisma.bindingTokenCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          telegramBotId: 'bot-1',
        }),
      });
    });

    it('rejects launch when target is mock-server', async () => {
      prisma.userFindUnique.mockResolvedValue({ telegramBotId: null });

      await expect(service.launch('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects launch when bot has no username', async () => {
      prisma.userFindUnique.mockResolvedValue({ telegramBotId: 'bot-1' });
      prisma.telegramBotFindUnique.mockResolvedValue({ botUsername: null });

      await expect(service.launch('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── consumeToken ──────────────────────────────────────────────────────

  describe('consumeToken', () => {
    it('binds chatId on a valid unused fresh token', async () => {
      const futureDate = new Date(Date.now() + 60_000);
      prisma.bindingTokenFindUnique.mockResolvedValue({
        id: 'tok-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: futureDate,
      });
      prisma.transaction.mockResolvedValue([]);

      const result = await service.consumeToken('abc123', 'chat-999');

      expect(result).toBe(true);
      expect(prisma.transaction).toHaveBeenCalled();
    });

    it('returns false for a missing token', async () => {
      prisma.bindingTokenFindUnique.mockResolvedValue(null);

      const result = await service.consumeToken('nonexistent', 'chat-1');
      expect(result).toBe(false);
    });

    it('returns false for an already-used token', async () => {
      prisma.bindingTokenFindUnique.mockResolvedValue({
        id: 'tok-1',
        userId: 'user-1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      const result = await service.consumeToken('used-token', 'chat-1');
      expect(result).toBe(false);
    });

    it('returns false for an expired token', async () => {
      prisma.bindingTokenFindUnique.mockResolvedValue({
        id: 'tok-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000), // in the past
      });

      const result = await service.consumeToken('expired', 'chat-1');
      expect(result).toBe(false);
    });
  });
});
