import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TaxiOrderCarSnapshotDto,
  TaxiOrderDto,
  TaxiOrderListDto,
  TaxiOrderServiceSnapshotDto,
  UpdateTaxiOrderStatusRequestDto,
} from '../dto/taxi-orders.dto.js';
import { TaxiOrderStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Admin view over submitted taxi orders (design D2). Wizard drafts (status
 * DRAFT) are internal and never listed; the default filter shows only the
 * active statuses NEW + CONFIRMED. Display fields come from the order's
 * immutable snapshots, so later dictionary edits cannot change past orders.
 */
@Injectable()
export class TaxiOrdersService {
  /** Statuses admins may set via PATCH; DRAFT stays wizard-internal. */
  private static readonly PATCHABLE_STATUSES: TaxiOrderStatus[] = [
    'NEW',
    'CONFIRMED',
    'COMPLETED',
    'CANCELLED',
  ];

  /** Default listing: current work only (spec «Дефолтный фильтр»). */
  private static readonly DEFAULT_STATUSES: TaxiOrderStatus[] = [
    'NEW',
    'CONFIRMED',
  ];

  constructor(private readonly prisma: PrismaService) {}

  async list(status?: string): Promise<TaxiOrderListDto> {
    let statuses = TaxiOrdersService.DEFAULT_STATUSES;
    if (status !== undefined) {
      if (
        !TaxiOrdersService.PATCHABLE_STATUSES.includes(
          status as TaxiOrderStatus,
        )
      ) {
        throw new BadRequestException(
          'status must be one of NEW, CONFIRMED, COMPLETED, CANCELLED',
        );
      }
      statuses = [status as TaxiOrderStatus];
    }
    const orders = await this.prisma.taxiOrder.findMany({
      where: { status: { in: statuses } },
      orderBy: [{ createdAt: 'desc' }],
      include: { user: true },
    });
    return { orders: orders.map((order) => this.toDto(order)) };
  }

  async updateStatus(
    id: string,
    dto: UpdateTaxiOrderStatusRequestDto,
  ): Promise<TaxiOrderDto> {
    if (
      !TaxiOrdersService.PATCHABLE_STATUSES.includes(
        dto.status as TaxiOrderStatus,
      )
    ) {
      throw new BadRequestException(
        'status must be one of NEW, CONFIRMED, COMPLETED, CANCELLED',
      );
    }
    const existing = await this.prisma.taxiOrder.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!existing) {
      throw new NotFoundException('Order not found');
    }
    if (existing.status === 'DRAFT') {
      throw new BadRequestException('Wizard drafts cannot be managed here');
    }
    const order = await this.prisma.taxiOrder.update({
      where: { id },
      data: { status: dto.status as TaxiOrderStatus },
      include: { user: true },
    });
    return this.toDto(order);
  }

  private toDto(order: {
    id: string;
    status: TaxiOrderStatus;
    passengerCount: number | null;
    fromCityName: string | null;
    toCityName: string | null;
    departureSlotLabel: string | null;
    serviceSnapshot: unknown;
    carSnapshot: unknown;
    priceBase: number | null;
    priceTotal: number | null;
    createdAt: Date;
    confirmedAt: Date | null;
    user: { id: string; email: string };
  }): TaxiOrderDto {
    const services = Array.isArray(order.serviceSnapshot)
      ? (order.serviceSnapshot as TaxiOrderServiceSnapshotDto[])
      : [];
    const car =
      order.carSnapshot && typeof order.carSnapshot === 'object'
        ? (order.carSnapshot as TaxiOrderCarSnapshotDto)
        : null;
    return new TaxiOrderDto({
      id: order.id,
      status: order.status,
      passengerId: order.user.id,
      passengerEmail: order.user.email,
      fromCityName: order.fromCityName,
      toCityName: order.toCityName,
      departureSlotLabel: order.departureSlotLabel,
      passengerCount: order.passengerCount,
      services,
      priceBase: order.priceBase,
      priceTotal: order.priceTotal,
      carSnapshot: car,
      createdAt: order.createdAt.toISOString(),
      confirmedAt: order.confirmedAt ? order.confirmedAt.toISOString() : null,
    });
  }
}
