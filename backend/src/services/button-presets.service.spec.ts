import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ButtonPresetsService } from './button-presets.service.js';

const makePrismaMock = () => {
  const create = vi.fn();
  const findMany = vi.fn();
  const findFirst = vi.fn();
  const updateMany = vi.fn();
  const deleteMany = vi.fn();

  return {
    instance: {
      buttonPreset: { create, findMany, findFirst, updateMany, deleteMany },
    } as any,
    create,
    findMany,
    findFirst,
    updateMany,
    deleteMany,
  };
};

const mkRow = (overrides: Partial<ReturnType<typeof baseRow>> = {}) => ({
  ...baseRow(),
  ...overrides,
});

function baseRow() {
  return {
    id: 'preset-1',
    name: 'Confirm / Decline',
    buttons: [
      { title: 'Да', callbackData: 'yes' },
      { title: 'Нет', callbackData: 'no' },
    ],
    ownerId: 'admin-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };
}

describe('ButtonPresetsService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: ButtonPresetsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new ButtonPresetsService(prisma.instance);
  });

  describe('create', () => {
    it('persists a preset with the caller as owner', async () => {
      prisma.create.mockResolvedValue(mkRow());

      const result = await service.create('admin-1', {
        name: 'Confirm / Decline',
        buttons: [
          { title: 'Да', callbackData: 'yes' },
          { title: 'Нет', callbackData: 'no' },
        ],
      });

      expect(prisma.create).toHaveBeenCalledWith({
        data: {
          name: 'Confirm / Decline',
          ownerId: 'admin-1',
          buttons: [
            { title: 'Да', callbackData: 'yes' },
            { title: 'Нет', callbackData: 'no' },
          ],
        },
      });
      expect(result.ownerId).toBe('admin-1');
      expect(result.buttons).toHaveLength(2);
    });

    it('rejects an empty buttons list (a preset must be usable as-is)', async () => {
      await expect(
        service.create('admin-1', { name: 'X', buttons: [] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.create).not.toHaveBeenCalled();
    });

    it('rejects invalid buttons (blank callbackData)', async () => {
      await expect(
        service.create('admin-1', {
          name: 'X',
          buttons: [{ title: 'ok', callbackData: '  ' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a blank preset name', async () => {
      await expect(
        service.create('admin-1', {
          name: '   ',
          buttons: [{ title: 'a', callbackData: 'b' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listForOwner', () => {
    it('passes the owner filter to Prisma', async () => {
      prisma.findMany.mockResolvedValue([
        mkRow({ id: 'p1', ownerId: 'admin-1' }),
        mkRow({ id: 'p2', ownerId: 'admin-1' }),
      ]);

      const result = await service.listForOwner('admin-1');

      expect(prisma.findMany).toHaveBeenCalledWith({
        where: { ownerId: 'admin-1' },
        orderBy: { updatedAt: 'desc' },
      });
      expect(result.map((p) => p.id)).toEqual(['p1', 'p2']);
    });

    it('returns an empty list when the admin owns nothing', async () => {
      prisma.findMany.mockResolvedValue([]);

      const result = await service.listForOwner('admin-1');
      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('issues a conditional updateMany scoped by ownerId', async () => {
      prisma.updateMany.mockResolvedValue({ count: 1 });
      prisma.findFirst.mockResolvedValue(
        mkRow({
          name: 'Renamed',
          buttons: [{ title: 'X', callbackData: 'x' }],
        }),
      );

      const result = await service.update('admin-1', 'preset-1', {
        name: 'Renamed',
        buttons: [{ title: 'X', callbackData: 'x' }],
      });

      expect(prisma.updateMany).toHaveBeenCalledWith({
        where: { id: 'preset-1', ownerId: 'admin-1' },
        data: {
          name: 'Renamed',
          buttons: [{ title: 'X', callbackData: 'x' }],
        },
      });
      expect(result.name).toBe('Renamed');
    });

    it('throws NotFound when updateMany matches zero rows (foreign or missing preset)', async () => {
      prisma.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update('admin-2', 'preset-of-admin-1', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.findFirst).not.toHaveBeenCalled();
    });

    it('rejects an empty update body', async () => {
      await expect(service.update('admin-1', 'preset-1', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an invalid buttons list without touching the row', async () => {
      await expect(
        service.update('admin-1', 'preset-1', { buttons: [] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('issues a conditional deleteMany scoped by ownerId', async () => {
      prisma.deleteMany.mockResolvedValue({ count: 1 });

      await expect(
        service.remove('admin-1', 'preset-1'),
      ).resolves.toBeUndefined();
      expect(prisma.deleteMany).toHaveBeenCalledWith({
        where: { id: 'preset-1', ownerId: 'admin-1' },
      });
    });

    it('throws NotFound when deleteMany matches zero rows', async () => {
      prisma.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.remove('admin-2', 'preset-of-admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
