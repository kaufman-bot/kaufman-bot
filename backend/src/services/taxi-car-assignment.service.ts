import { Injectable } from '@nestjs/common';
import type { Prisma, TaxiOrderStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Shared occupancy criterion (design D11): a car is busy while it holds a
 * NEW/CONFIRMED order. Used both by the assignment below and by the catalog
 * service when it blocks deletion of busy cars/drivers. COMPLETED/CANCELLED
 * orders release their car automatically — no extra bookkeeping.
 */
export const TAXI_CAR_BUSY_STATUSES: TaxiOrderStatus[] = ['NEW', 'CONFIRMED'];

/**
 * Use-case service that picks a free car for a submitted order (design D11):
 * - capacity: `seats >= passengerCount`;
 * - equipment: the car must provide every requested car-feature service;
 * - both car and driver must be active;
 * - "free": no NEW/CONFIRMED order holds the car (TAXI_CAR_BUSY_STATUSES);
 * - best-fit: minimal sufficient seats, ties broken by earlier creation.
 */
@Injectable()
export class TaxiCarAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the best free car (with its driver and features) or `null` when
   * no car satisfies the request. Runs inside the caller's transaction when
   * a `tx` client is passed (wizard confirmation).
   */
  async findFreeCar(
    passengerCount: number,
    requiredFeatureIds: string[],
    tx?: Prisma.TransactionClient | PrismaService,
  ) {
    const db = tx ?? this.prisma;
    const candidates = await db.taxiCar.findMany({
      where: {
        isActive: true,
        driver: { isActive: true },
        seats: { gte: passengerCount },
        AND: requiredFeatureIds.map((id) => ({
          features: { some: { id } },
        })),
      },
      orderBy: [{ seats: 'asc' }, { createdAt: 'asc' }],
      include: { driver: true, features: true },
    });
    for (const car of candidates) {
      const busy = await db.taxiOrder.count({
        where: {
          carId: car.id,
          status: { in: TAXI_CAR_BUSY_STATUSES },
        },
      });
      if (busy === 0) {
        return car;
      }
    }
    return null;
  }
}
