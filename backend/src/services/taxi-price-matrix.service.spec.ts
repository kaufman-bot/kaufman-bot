import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaxiPriceMatrixService } from './taxi-price-matrix.service.js';

const makePrismaMock = () => {
  const cityFindMany = vi.fn().mockResolvedValue([]);
  const cityPriceFindUnique = vi.fn();
  const cityPriceFindMany = vi.fn().mockResolvedValue([]);
  const cityPriceUpsert = vi.fn().mockResolvedValue({});
  const transaction = vi.fn().mockImplementation(async (ops) => ops);

  return {
    instance: {
      taxiCity: { findMany: cityFindMany },
      taxiCityPrice: {
        findUnique: cityPriceFindUnique,
        findMany: cityPriceFindMany,
        upsert: cityPriceUpsert,
      },
      $transaction: transaction,
    } as any,
    cityFindMany,
    cityPriceFindUnique,
    cityPriceFindMany,
    cityPriceUpsert,
    transaction,
  };
};

/** Seeded-like route: 7 cities along Moscow → Saint-Petersburg. */
const ROUTE = [
  { id: 'c-msk', name: 'Москва', distanceKm: 0, isActive: true },
  { id: 'c-tvr', name: 'Тверь', distanceKm: 167, isActive: true },
  { id: 'c-vv', name: 'Вышний Волочёк', distanceKm: 297, isActive: true },
  { id: 'c-blg', name: 'Бологое', distanceKm: 377, isActive: true },
  { id: 'c-vgd', name: 'Великий Новгород', distanceKm: 531, isActive: true },
  { id: 'c-chd', name: 'Чудово', distanceKm: 585, isActive: true },
  { id: 'c-spb', name: 'Санкт-Петербург', distanceKm: 700, isActive: true },
];

describe('TaxiPriceMatrixService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: TaxiPriceMatrixService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    service = new TaxiPriceMatrixService(prisma.instance);
  });

  describe('getMatrix', () => {
    it('returns cities by km marker plus stored pair prices', async () => {
      prisma.cityFindMany.mockResolvedValue(ROUTE);
      prisma.cityPriceFindMany.mockResolvedValue([
        { fromCityId: 'c-msk', toCityId: 'c-spb', price: 4900 },
      ]);

      const matrix = await service.getMatrix();

      expect(matrix.cities).toHaveLength(7);
      expect(matrix.cities[0].name).toBe('Москва');
      expect(matrix.prices).toEqual([
        { fromCityId: 'c-msk', toCityId: 'c-spb', price: 4900 },
      ]);
    });
  });

  describe('setPairPrice', () => {
    it('normalizes the pair so both directions hit the same row', async () => {
      prisma.cityFindMany.mockResolvedValue([ROUTE[0], ROUTE[6]]);

      await service.setPairPrice('c-spb', 'c-msk', { price: 4900 });

      expect(prisma.cityPriceUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            fromCityId_toCityId: { fromCityId: 'c-msk', toCityId: 'c-spb' },
          },
        }),
      );
    });

    it('rejects a negative, fractional price or same-city pair with 400', async () => {
      await expect(
        service.setPairPrice('a', 'b', { price: -1 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.setPairPrice('a', 'b', { price: 10.5 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.setPairPrice('a', 'a', { price: 10 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.cityPriceUpsert).not.toHaveBeenCalled();
    });

    it('rejects an unknown city with 404', async () => {
      prisma.cityFindMany.mockResolvedValue([ROUTE[0]]);
      await expect(
        service.setPairPrice('c-msk', 'ghost', { price: 10 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('pairPrice (wizard helper)', () => {
    it('normalizes the pair and returns the stored price', async () => {
      prisma.cityPriceFindUnique.mockResolvedValue({ price: 910 });

      expect(await service.pairPrice('c-vv', 'c-msk')).toBe(910);
      expect(prisma.cityPriceFindUnique).toHaveBeenCalledWith({
        where: {
          fromCityId_toCityId: { fromCityId: 'c-msk', toCityId: 'c-vv' },
        },
      });
    });

    it('returns null when the pair has no price yet', async () => {
      prisma.cityPriceFindUnique.mockResolvedValue(null);
      expect(await service.pairPrice('a', 'b')).toBeNull();
    });
  });

  describe('autoCalc', () => {
    it('fills every pair proportionally; the extreme pair is exact', async () => {
      prisma.cityFindMany.mockResolvedValue(ROUTE);

      const result = await service.autoCalc({ price: 4900 });

      // 7 cities → C(7,2) = 21 unordered pairs
      expect(result.pairs).toBe(21);
      expect(prisma.transaction).toHaveBeenCalledTimes(1);
      const ops = prisma.cityPriceUpsert.mock.calls.map(
        ([arg]) =>
          arg as {
            where: {
              fromCityId_toCityId: { fromCityId: string; toCityId: string };
            };
            update: { price: number };
            create: { price: number };
          },
      );
      expect(ops).toHaveLength(21);

      const priceOf = (a: string, b: string) => {
        const op = ops.find(
          (o) =>
            (o.where.fromCityId_toCityId.fromCityId === a &&
              o.where.fromCityId_toCityId.toCityId === b) ||
            (o.where.fromCityId_toCityId.fromCityId === b &&
              o.where.fromCityId_toCityId.toCityId === a),
        );
        return op?.create.price;
      };

      // Extreme pair: round(700 × 4900/700) = 4900 exactly
      expect(priceOf('c-msk', 'c-spb')).toBe(4900);
      // pricePerKm = 7: Тверь (167 км) → СПб (700 км): round(533 × 7) = 3731
      expect(priceOf('c-tvr', 'c-spb')).toBe(3731);
      // Тверь → Вышний Волочёк: round(130 × 7) = 910
      expect(priceOf('c-tvr', 'c-vv')).toBe(910);
      // Neighbours share the normalized ordering where required
      const mskChd = ops.find(
        (o) =>
          (o.where.fromCityId_toCityId.fromCityId === 'c-chd' &&
            o.where.fromCityId_toCityId.toCityId === 'c-msk') ||
          (o.where.fromCityId_toCityId.fromCityId === 'c-msk' &&
            o.where.fromCityId_toCityId.toCityId === 'c-chd'),
      );
      expect(mskChd).toBeDefined();
      // Москва → Чудово: round(585 × 7) = 4095
      expect(mskChd?.create.price).toBe(4095);
    });

    it('overwrites existing prices instead of summing', async () => {
      prisma.cityFindMany.mockResolvedValue(ROUTE.slice(0, 3));

      await service.autoCalc({ price: 700 });

      const ops = prisma.cityPriceUpsert.mock.calls.map(
        ([arg]) => arg as { update: { price: number } },
      );
      // 3 cities → 3 pairs, every op overwrites (update branch present)
      expect(ops).toHaveLength(3);
      for (const op of ops) {
        expect(op.update).toEqual({ price: expect.any(Number) });
      }
    });

    it('rejects when fewer than two active cities exist (400)', async () => {
      prisma.cityFindMany.mockResolvedValue([ROUTE[0]]);
      await expect(service.autoCalc({ price: 100 })).rejects.toThrow(
        BadRequestException,
      );
      prisma.cityFindMany.mockResolvedValue([]);
      await expect(service.autoCalc({ price: 100 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects cities with identical km markers (400)', async () => {
      prisma.cityFindMany.mockResolvedValue([
        { id: 'a', name: 'A', distanceKm: 100, isActive: true },
        { id: 'b', name: 'B', distanceKm: 100, isActive: true },
      ]);
      await expect(service.autoCalc({ price: 100 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an invalid entered price (400)', async () => {
      await expect(service.autoCalc({ price: -5 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.autoCalc({ price: 1.2 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
