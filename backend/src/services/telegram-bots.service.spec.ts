import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramBotsService } from './telegram-bots.service.js';

const makePrismaMock = () => {
  const create = vi.fn();
  const findMany = vi.fn();
  const findFirst = vi.fn();
  const findUnique = vi.fn();
  const updateMany = vi.fn();
  const remove = vi.fn();

  return {
    instance: {
      telegramBot: {
        create,
        findMany,
        findFirst,
        findUnique,
        updateMany,
        delete: remove,
      },
    } as any,
    create,
    findMany,
    findFirst,
    findUnique,
    updateMany,
    remove,
  };
};

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bot-1',
    ownerId: 'admin-1',
    name: 'Support Bot',
    botToken: '123456789:AAHabcdefghijklmnopqrstuvwxyz',
    botUsername: 'support_bot',
    isActive: true,
    webhookSecret: 'secret-abc',
    settings: { greeting: 'hello' },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

describe('TelegramBotsService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: TelegramBotsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new TelegramBotsService(prisma.instance);
  });

  describe('create', () => {
    it('persists a bot and returns a DTO with masked token', async () => {
      prisma.create.mockResolvedValue(baseRow());

      const result = await service.create('admin-1', {
        name: 'Support Bot',
        botToken: '123456789:AAHabcdefghijklmnopqrstuvwxyz',
        botUsername: 'support_bot',
      });

      expect(prisma.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ownerId: 'admin-1',
          name: 'Support Bot',
          botToken: '123456789:AAHabcdefghijklmnopqrstuvwxyz',
          botUsername: 'support_bot',
          isActive: true,
        }),
      });
      // Token is masked: first 6 + '…' + last 4
      expect(result.botToken).toBe('123456…wxyz');
      expect(result.name).toBe('Support Bot');
    });

    it('rejects an empty name', async () => {
      await expect(
        service.create('admin-1', { name: '   ', botToken: 'valid-token' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an empty token', async () => {
      await expect(
        service.create('admin-1', { name: 'ok', botToken: '' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listForOwner', () => {
    it('filters by ownerId and returns masked tokens', async () => {
      prisma.findMany.mockResolvedValue([baseRow(), baseRow({ id: 'bot-2' })]);

      const result = await service.listForOwner('admin-1');

      expect(prisma.findMany).toHaveBeenCalledWith({
        where: { ownerId: 'admin-1' },
        orderBy: { updatedAt: 'desc' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].botToken).toContain('…');
    });

    it('returns empty array when owner has no bots', async () => {
      prisma.findMany.mockResolvedValue([]);
      const result = await service.listForOwner('admin-1');
      expect(result).toEqual([]);
    });
  });

  describe('get', () => {
    it('returns bot when found by id+ownerId', async () => {
      prisma.findFirst.mockResolvedValue(baseRow());

      const result = await service.get('admin-1', 'bot-1');

      expect(prisma.findFirst).toHaveBeenCalledWith({
        where: { id: 'bot-1', ownerId: 'admin-1' },
      });
      expect(result.id).toBe('bot-1');
    });

    it('throws NotFound for missing or foreign bot', async () => {
      prisma.findFirst.mockResolvedValue(null);

      await expect(service.get('admin-2', 'bot-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('issues conditional updateMany scoped by ownerId', async () => {
      prisma.updateMany.mockResolvedValue({ count: 1 });
      prisma.findFirst.mockResolvedValue(baseRow({ name: 'Renamed' }));

      const result = await service.update('admin-1', 'bot-1', {
        name: 'Renamed',
      });

      expect(prisma.updateMany).toHaveBeenCalledWith({
        where: { id: 'bot-1', ownerId: 'admin-1' },
        data: { name: 'Renamed' },
      });
      expect(result.name).toBe('Renamed');
    });

    it('throws NotFound when updateMany matches zero rows', async () => {
      prisma.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update('admin-2', 'bot-1', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an empty body (no fields)', async () => {
      await expect(service.update('admin-1', 'bot-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('toggles isActive', async () => {
      prisma.updateMany.mockResolvedValue({ count: 1 });
      prisma.findFirst.mockResolvedValue(baseRow({ isActive: false }));

      const result = await service.update('admin-1', 'bot-1', {
        isActive: false,
      });

      expect(prisma.updateMany).toHaveBeenCalledWith({
        where: { id: 'bot-1', ownerId: 'admin-1' },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(false);
    });
  });

  describe('remove', () => {
    it('finds the bot and deletes it, returning the raw token', async () => {
      prisma.findFirst.mockResolvedValue({
        botToken: '123456789:AAHabcdefghijklmnopqrstuvwxyz',
      });
      prisma.remove.mockResolvedValue(baseRow());

      const result = await service.remove('admin-1', 'bot-1');

      expect(prisma.findFirst).toHaveBeenCalledWith({
        where: { id: 'bot-1', ownerId: 'admin-1' },
        select: { botToken: true },
      });
      expect(prisma.remove).toHaveBeenCalledWith({ where: { id: 'bot-1' } });
      expect(result.botToken).toBe('123456789:AAHabcdefghijklmnopqrstuvwxyz');
    });

    it('throws NotFound for missing or foreign bot', async () => {
      prisma.findFirst.mockResolvedValue(null);

      await expect(service.remove('admin-2', 'bot-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('token masking', () => {
    it('short tokens (<=10 chars) are fully masked', async () => {
      prisma.create.mockResolvedValue(baseRow({ botToken: 'short123' }));

      const result = await service.create('admin-1', {
        name: 'Test',
        botToken: 'short123',
      });

      expect(result.botToken).toBe('…');
    });

    it('long tokens show first 6 + … + last 4', async () => {
      prisma.create.mockResolvedValue(
        baseRow({ botToken: '1234567890abcdef' }),
      );

      const result = await service.create('admin-1', {
        name: 'Test',
        botToken: '1234567890abcdef',
      });

      expect(result.botToken).toBe('123456…cdef');
    });
  });

  describe('settings round-trip', () => {
    it('stores and returns settings as-is', async () => {
      const settings = { theme: 'dark', maxRetries: 3 };
      prisma.create.mockResolvedValue(baseRow({ settings }));

      const result = await service.create('admin-1', {
        name: 'Test',
        botToken: 'valid-token-here-1234',
        settings,
      });

      expect(result.settings).toEqual(settings);
    });

    it('null settings is stored as null and returned as null', async () => {
      prisma.create.mockResolvedValue(baseRow({ settings: null }));

      const result = await service.create('admin-1', {
        name: 'Test',
        botToken: 'valid-token-here-1234',
        settings: null,
      });

      expect(result.settings).toBeNull();
    });
  });
});
