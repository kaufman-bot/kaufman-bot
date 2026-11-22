import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaxiOrdersService } from './taxi-orders.service.js';

const makePrismaMock = () => {
  const orderFindMany = vi.fn().mockResolvedValue([]);
  const orderFindUnique = vi.fn();
  const orderUpdate = vi.fn();

  return {
    instance: {
      taxiOrder: {
        findMany: orderFindMany,
        findUnique: orderFindUnique,
        update: orderUpdate,
      },
    } as any,
    orderFindMany,
    orderFindUnique,
    orderUpdate,
  };
};

const orderRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'ord-1',
  status: 'NEW',
  passengerCount: 2,
  fromCityName: 'Москва',
  toCityName: 'Санкт-Петербург',
  departureSlotLabel: '12:00',
  serviceSnapshot: [{ id: 'svc-1', name: 'Детское кресло', surcharge: 300 }],
  carSnapshot: {
    driverName: 'Иван Петров',
    model: 'Camry',
    plate: 'А123ВС77',
    color: 'чёрный',
  },
  priceBase: 4900,
  priceTotal: 5200,
  createdAt: new Date('2026-11-22T10:00:00Z'),
  confirmedAt: new Date('2026-11-22T10:01:00Z'),
  user: { id: 'user-1', email: 'user@example.com' },
  ...over,
});

describe('TaxiOrdersService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: TaxiOrdersService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    service = new TaxiOrdersService(prisma.instance);
  });

  describe('list', () => {
    it('defaults to NEW+CONFIRMED, drafts excluded, newest first', async () => {
      prisma.orderFindMany.mockResolvedValue([orderRow()]);

      await service.list();

      expect(prisma.orderFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: { in: ['NEW', 'CONFIRMED'] } },
          orderBy: [{ createdAt: 'desc' }],
        }),
      );
    });

    it('maps snapshot JSON into the typed DTO with the passenger', async () => {
      prisma.orderFindMany.mockResolvedValue([orderRow()]);

      const { orders } = await service.list();

      expect(orders[0]).toEqual(
        expect.objectContaining({
          id: 'ord-1',
          status: 'NEW',
          passengerEmail: 'user@example.com',
          passengerId: 'user-1',
          fromCityName: 'Москва',
          toCityName: 'Санкт-Петербург',
          departureSlotLabel: '12:00',
          passengerCount: 2,
          priceBase: 4900,
          priceTotal: 5200,
          carSnapshot: expect.objectContaining({ plate: 'А123ВС77' }),
          services: [
            expect.objectContaining({ name: 'Детское кресло', surcharge: 300 }),
          ],
        }),
      );
    });

    it('applies an explicit status filter and rejects unknown values', async () => {
      prisma.orderFindMany.mockResolvedValue([]);

      await service.list('COMPLETED');
      expect(prisma.orderFindMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { status: { in: ['COMPLETED'] } } }),
      );

      await expect(service.list('DRAFT')).rejects.toThrow(BadRequestException);
      await expect(service.list('bogus')).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateStatus', () => {
    it('patches the status of an existing submitted order', async () => {
      prisma.orderFindUnique.mockResolvedValue(orderRow({ id: 'ord-9' }));
      prisma.orderUpdate.mockResolvedValue(
        orderRow({ id: 'ord-9', status: 'CONFIRMED' }),
      );

      const dto = await service.updateStatus('ord-9', { status: 'CONFIRMED' });

      expect(dto.status).toBe('CONFIRMED');
      expect(prisma.orderUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ord-9' },
          data: { status: 'CONFIRMED' },
        }),
      );
    });

    it('rejects unknown statuses and DRAFT with 400', async () => {
      await expect(
        service.updateStatus('ord-1', { status: 'DRAFT' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateStatus('ord-1', { status: 'WEIRD' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.orderFindUnique).not.toHaveBeenCalled();
    });

    it('rejects an unknown order with 404 and a draft with 400', async () => {
      prisma.orderFindUnique.mockResolvedValue(null);
      await expect(
        service.updateStatus('ghost', { status: 'CONFIRMED' }),
      ).rejects.toThrow(NotFoundException);

      prisma.orderFindUnique.mockResolvedValue(orderRow({ status: 'DRAFT' }));
      await expect(
        service.updateStatus('ord-1', { status: 'CONFIRMED' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
