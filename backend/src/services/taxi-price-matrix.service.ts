import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AutoCalcRequestDto,
  AutoCalcResultDto,
  SetPairPriceRequestDto,
  TaxiPriceMatrixDto,
} from '../dto/taxi-price-matrix.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Use-case service over the taxi price matrix (design D2/D5/D6). Prices live
 * once per unordered pair: every write normalizes the pair to
 * `fromCityId < toCityId` (lexicographic), so symmetry needs no second row
 * and no extra query.
 */
@Injectable()
export class TaxiPriceMatrixService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds the admin matrix view: cities ordered by km marker plus every
   * stored pair price (one row per unordered pair).
   */
  async getMatrix(): Promise<TaxiPriceMatrixDto> {
    const [cities, prices] = await Promise.all([
      this.prisma.taxiCity.findMany({ orderBy: [{ distanceKm: 'asc' }] }),
      this.prisma.taxiCityPrice.findMany({
        orderBy: [{ fromCityId: 'asc' }, { toCityId: 'asc' }],
      }),
    ]);
    return {
      cities: cities.map(({ id, name, distanceKm }) => ({
        id,
        name,
        distanceKm,
      })),
      prices: prices.map(({ fromCityId, toCityId, price }) => ({
        fromCityId,
        toCityId,
        price,
      })),
    };
  }

  /**
   * Creates or overwrites the price of one pair. Both directions of the
   * request address the same normalized row — symmetry for free (D6).
   */
  async setPairPrice(
    fromCityId: string,
    toCityId: string,
    dto: SetPairPriceRequestDto,
  ): Promise<{ fromCityId: string; toCityId: string; price: number }> {
    const price = this.requirePrice(dto.price);
    const [a, b] = this.normalizePair(fromCityId, toCityId);
    await this.requireCitiesExist(a, b);
    await this.prisma.taxiCityPrice.upsert({
      where: { fromCityId_toCityId: { fromCityId: a, toCityId: b } },
      update: { price },
      create: { fromCityId: a, toCityId: b, price },
    });
    return { fromCityId: a, toCityId: b, price };
  }

  /**
   * Wizard helper: reads the normalized pair price or `null` when unset.
   */
  async pairPrice(
    fromCityId: string,
    toCityId: string,
  ): Promise<number | null> {
    const [a, b] = this.normalizePair(fromCityId, toCityId);
    const row = await this.prisma.taxiCityPrice.findUnique({
      where: { fromCityId_toCityId: { fromCityId: a, toCityId: b } },
    });
    return row ? row.price : null;
  }

  /**
   * Recalculates every pair from the price between the extreme cities
   * (min/max `distanceKm` among ACTIVE cities): pricePerKm = price / totalKm,
   * pair price = round(|Δkm| × pricePerKm). The extreme pair receives the
   * entered price exactly; existing prices are overwritten, not summed (D5).
   */
  async autoCalc(dto: AutoCalcRequestDto): Promise<AutoCalcResultDto> {
    const price = this.requirePrice(dto.price);
    const cities = await this.prisma.taxiCity.findMany({
      where: { isActive: true },
      orderBy: [{ distanceKm: 'asc' }],
    });
    if (cities.length < 2) {
      throw new BadRequestException(
        'Auto-calc requires at least two active cities',
      );
    }
    const totalKm = cities[cities.length - 1].distanceKm - cities[0].distanceKm;
    if (totalKm === 0) {
      throw new BadRequestException(
        'Extreme cities have the same km marker; auto-calc is impossible',
      );
    }
    const pricePerKm = price / totalKm;
    const ops = [];
    for (let i = 0; i < cities.length; i++) {
      for (let j = i + 1; j < cities.length; j++) {
        const a = cities[i].id;
        const b = cities[j].id;
        const [fromCityId, toCityId] = this.normalizePair(a, b);
        const pairPrice = Math.round(
          Math.abs(cities[j].distanceKm - cities[i].distanceKm) * pricePerKm,
        );
        ops.push(
          this.prisma.taxiCityPrice.upsert({
            where: { fromCityId_toCityId: { fromCityId, toCityId } },
            update: { price: pairPrice },
            create: { fromCityId, toCityId, price: pairPrice },
          }),
        );
      }
    }
    await this.prisma.$transaction(ops);
    return { pairs: ops.length };
  }

  private requirePrice(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new BadRequestException('price must be a non-negative integer');
    }
    return value;
  }

  private normalizePair(a: string, b: string): [string, string] {
    if (a === b) {
      throw new BadRequestException(
        'fromCityId and toCityId must be different cities',
      );
    }
    return a < b ? [a, b] : [b, a];
  }

  private async requireCitiesExist(a: string, b: string) {
    const cities = await this.prisma.taxiCity.findMany({
      where: { id: { in: [a, b] } },
    });
    if (cities.length !== 2) {
      throw new NotFoundException('City not found');
    }
  }
}
