import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaxiCarAssignmentService } from './taxi-car-assignment.service.js';

const makePrismaMock = () => {
  const carFindMany = vi.fn().mockResolvedValue([]);
  const orderCount = vi.fn().mockResolvedValue(0);

  return {
    instance: {
      taxiCar: { findMany: carFindMany },
      taxiOrder: { count: orderCount },
    } as any,
    carFindMany,
    orderCount,
  };
};

describe('TaxiCarAssignmentService (design D11)', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: TaxiCarAssignmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    service = new TaxiCarAssignmentService(prisma.instance);
  });

  const car = (over: Partial<Record<string, unknown>>) => ({
    id: 'car-x',
    seats: 4,
    driver: { id: 'drv-1', isActive: true },
    features: [],
    ...over,
  });

  it('filters candidates by capacity, active flags and feature coverage', async () => {
    prisma.carFindMany.mockResolvedValue([car({})]);

    await service.findFreeCar(3, ['svc-a', 'svc-b']);

    expect(prisma.carFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          driver: { isActive: true },
          seats: { gte: 3 },
          AND: [
            { features: { some: { id: 'svc-a' } } },
            { features: { some: { id: 'svc-b' } } },
          ],
        }),
        orderBy: [{ seats: 'asc' }, { createdAt: 'asc' }],
      }),
    );
  });

  it('skips busy cars and returns the first free candidate (best-fit order)', async () => {
    const smallFree = car({ id: 'car-small', seats: 2 });
    prisma.carFindMany.mockResolvedValueOnce([
      smallFree,
      car({ id: 'car-busy', seats: 4 }),
    ]);
    prisma.orderCount
      .mockResolvedValueOnce(0) // car-small free
      .mockResolvedValue(1); // car-busy busy (not reached)

    const picked = await service.findFreeCar(2, []);

    expect(picked?.id).toBe('car-small');
  });

  it('returns null when every candidate is busy', async () => {
    prisma.carFindMany.mockResolvedValue([
      car({ id: 'car-a' }),
      car({ id: 'car-b' }),
    ]);
    prisma.orderCount.mockResolvedValue(1);

    expect(await service.findFreeCar(2, [])).toBeNull();
  });

  it('returns null when there are no candidates at all', async () => {
    prisma.carFindMany.mockResolvedValue([]);
    expect(await service.findFreeCar(5, ['svc-a'])).toBeNull();
  });
});
