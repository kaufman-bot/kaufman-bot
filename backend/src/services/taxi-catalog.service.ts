import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateTaxiCarRequestDto,
  CreateTaxiCityRequestDto,
  CreateTaxiDepartureSlotRequestDto,
  CreateTaxiDriverRequestDto,
  CreateTaxiExtraServiceRequestDto,
  CreateTaxiPassengerOptionRequestDto,
  TaxiCarListDto,
  TaxiCityListDto,
  TaxiDepartureSlotListDto,
  TaxiDriverListDto,
  TaxiExtraServiceListDto,
  TaxiPassengerOptionListDto,
  UpdateTaxiCarRequestDto,
  UpdateTaxiCityRequestDto,
  UpdateTaxiDepartureSlotRequestDto,
  UpdateTaxiDriverRequestDto,
  UpdateTaxiExtraServiceRequestDto,
  UpdateTaxiPassengerOptionRequestDto,
} from '../dto/taxi-catalog.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TAXI_CAR_BUSY_STATUSES } from './taxi-car-assignment.service.js';

/**
 * Entity-CRUD over the taxi dictionaries (cities, extra services, departure
 * slots, passenger options; drivers and cars in the same service). All value
 * rules live here — controllers stay thin (skill service-layer-split; design
 * D2/D3). Uniqueness violations surface as `ConflictException`, bad values as
 * `BadRequestException`, unknown ids as `NotFoundException`.
 */
@Injectable()
export class TaxiCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /* ------------------------------- validation ------------------------------- */

  private async requireExisting(
    id: string,
    label: string,
    find: () => Promise<{ id: string } | null>,
  ) {
    const existing = await find();
    if (!existing) {
      throw new NotFoundException(`${label} not found`);
    }
    return existing;
  }

  private requireName(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${field} must be a non-empty string`);
    }
    const name = value.trim();
    if (name.length > 100) {
      throw new BadRequestException(`${field} must be at most 100 characters`);
    }
    return name;
  }

  private requireNonNegativeInt(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new BadRequestException(`${field} must be a non-negative integer`);
    }
    return value;
  }

  private requireHhMm(value: unknown): string {
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      throw new BadRequestException(
        'time must be in HH:MM format (00:00..23:59)',
      );
    }
    return value;
  }

  private async ensureCityNameFree(name: string, excludeId?: string) {
    const existing = await this.prisma.taxiCity.findUnique({ where: { name } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`City name already exists: "${name}"`);
    }
  }

  private async ensureServiceNameFree(name: string, excludeId?: string) {
    const existing = await this.prisma.taxiExtraService.findUnique({
      where: { name },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Service name already exists: "${name}"`);
    }
  }

  private async ensureSlotTimeFree(time: string, excludeId?: string) {
    const existing = await this.prisma.taxiDepartureSlot.findUnique({
      where: { time },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Departure time already exists: "${time}"`);
    }
  }

  private async ensurePassengerCountFree(count: number, excludeId?: string) {
    const existing = await this.prisma.taxiPassengerOption.findUnique({
      where: { count },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Passenger option already exists: ${count}`);
    }
  }

  /* --------------------------------- cities --------------------------------- */

  async listCities(): Promise<TaxiCityListDto> {
    return {
      cities: await this.prisma.taxiCity.findMany({
        orderBy: [{ distanceKm: 'asc' }],
      }),
    };
  }

  async createCity(dto: CreateTaxiCityRequestDto) {
    const name = this.requireName(dto.name, 'name');
    const distanceKm = this.requireNonNegativeInt(dto.distanceKm, 'distanceKm');
    await this.ensureCityNameFree(name);
    return this.prisma.taxiCity.create({
      data: {
        name,
        distanceKm,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateCity(id: string, dto: UpdateTaxiCityRequestDto) {
    if (dto.name !== undefined) {
      const name = this.requireName(dto.name, 'name');
      await this.ensureCityNameFree(name, id);
      dto = { ...dto, name };
    }
    if (dto.distanceKm !== undefined) {
      dto = {
        ...dto,
        distanceKm: this.requireNonNegativeInt(dto.distanceKm, 'distanceKm'),
      };
    }
    await this.requireExisting(id, 'City', () =>
      this.prisma.taxiCity.findUnique({ where: { id } }),
    );
    return this.prisma.taxiCity.update({
      where: { id },
      data: {
        name: dto.name,
        distanceKm: dto.distanceKm,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });
  }

  /**
   * Deletes a city. Price pairs cascade via FK; DRAFT wizard orders that
   * reference the city are reset (deleted) so the wizard offers the next
   * `/taxi` run a fresh start. Confirmed orders keep the city alive — the
   * admin must resolve those first (spec: «Удаление пункта с заказами»).
   */
  async removeCity(id: string) {
    const city = await this.prisma.taxiCity.findUnique({ where: { id } });
    if (!city) {
      throw new NotFoundException('City not found');
    }
    const confirmedOrders = await this.prisma.taxiOrder.count({
      where: {
        OR: [{ fromCityId: id }, { toCityId: id }],
        status: { not: 'DRAFT' },
      },
    });
    if (confirmedOrders > 0) {
      throw new BadRequestException(
        'City is referenced by submitted taxi orders and cannot be deleted',
      );
    }
    await this.prisma.$transaction([
      this.prisma.taxiOrder.deleteMany({
        where: { OR: [{ fromCityId: id }, { toCityId: id }], status: 'DRAFT' },
      }),
      this.prisma.taxiCity.delete({ where: { id } }),
    ]);
  }

  /* -------------------------------- services -------------------------------- */

  async listServices(): Promise<TaxiExtraServiceListDto> {
    return {
      services: await this.prisma.taxiExtraService.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    };
  }

  async createService(dto: CreateTaxiExtraServiceRequestDto) {
    const name = this.requireName(dto.name, 'name');
    const surcharge = this.requireNonNegativeInt(dto.surcharge, 'surcharge');
    await this.ensureServiceNameFree(name);
    return this.prisma.taxiExtraService.create({
      data: {
        name,
        surcharge,
        isCarFeature: dto.isCarFeature ?? false,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateService(id: string, dto: UpdateTaxiExtraServiceRequestDto) {
    if (dto.name !== undefined) {
      const name = this.requireName(dto.name, 'name');
      await this.ensureServiceNameFree(name, id);
      dto = { ...dto, name };
    }
    if (dto.surcharge !== undefined) {
      dto = {
        ...dto,
        surcharge: this.requireNonNegativeInt(dto.surcharge, 'surcharge'),
      };
    }
    await this.requireExisting(id, 'Service', () =>
      this.prisma.taxiExtraService.findUnique({ where: { id } }),
    );
    return this.prisma.taxiExtraService.update({
      where: { id },
      data: {
        name: dto.name,
        surcharge: dto.surcharge,
        isCarFeature: dto.isCarFeature,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async removeService(id: string) {
    const existing = await this.prisma.taxiExtraService.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Service not found');
    }
    await this.prisma.taxiExtraService.delete({ where: { id } });
  }

  /* ----------------------------- departure slots ----------------------------- */

  async listDepartureSlots(): Promise<TaxiDepartureSlotListDto> {
    return {
      slots: await this.prisma.taxiDepartureSlot.findMany({
        orderBy: [{ sortOrder: 'asc' }, { time: 'asc' }],
      }),
    };
  }

  async createDepartureSlot(dto: CreateTaxiDepartureSlotRequestDto) {
    const time = this.requireHhMm(dto.time);
    await this.ensureSlotTimeFree(time);
    return this.prisma.taxiDepartureSlot.create({
      data: {
        time,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateDepartureSlot(
    id: string,
    dto: UpdateTaxiDepartureSlotRequestDto,
  ) {
    if (dto.time !== undefined) {
      const time = this.requireHhMm(dto.time);
      await this.ensureSlotTimeFree(time, id);
      dto = { ...dto, time };
    }
    await this.requireExisting(id, 'Departure slot', () =>
      this.prisma.taxiDepartureSlot.findUnique({ where: { id } }),
    );
    return this.prisma.taxiDepartureSlot.update({
      where: { id },
      data: {
        time: dto.time,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async removeDepartureSlot(id: string) {
    const existing = await this.prisma.taxiDepartureSlot.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Departure slot not found');
    }
    await this.prisma.taxiDepartureSlot.delete({ where: { id } });
  }

  /* ---------------------------- passenger options ---------------------------- */

  async listPassengerOptions(): Promise<TaxiPassengerOptionListDto> {
    return {
      options: await this.prisma.taxiPassengerOption.findMany({
        orderBy: [{ sortOrder: 'asc' }, { count: 'asc' }],
      }),
    };
  }

  async createPassengerOption(dto: CreateTaxiPassengerOptionRequestDto) {
    const count = this.requireNonNegativeInt(dto.count, 'count');
    if (count === 0) {
      throw new BadRequestException('count must be a positive integer');
    }
    await this.ensurePassengerCountFree(count);
    return this.prisma.taxiPassengerOption.create({
      data: {
        count,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updatePassengerOption(
    id: string,
    dto: UpdateTaxiPassengerOptionRequestDto,
  ) {
    if (dto.count !== undefined) {
      const count = this.requireNonNegativeInt(dto.count, 'count');
      if (count === 0) {
        throw new BadRequestException('count must be a positive integer');
      }
      await this.ensurePassengerCountFree(count, id);
      dto = { ...dto, count };
    }
    await this.requireExisting(id, 'Passenger option', () =>
      this.prisma.taxiPassengerOption.findUnique({ where: { id } }),
    );
    return this.prisma.taxiPassengerOption.update({
      where: { id },
      data: {
        count: dto.count,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async removePassengerOption(id: string) {
    const existing = await this.prisma.taxiPassengerOption.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Passenger option not found');
    }
    await this.prisma.taxiPassengerOption.delete({ where: { id } });
  }

  /* ------------------------- drivers and their cars ------------------------- */

  private readonly driverInclude = {
    cars: { include: { features: true } },
  } as const;

  private requirePositiveInt(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    return value;
  }

  private requirePlate(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('plate must be a non-empty string');
    }
    return value.trim();
  }

  private async ensurePlateFree(plate: string, excludeId?: string) {
    const existing = await this.prisma.taxiCar.findUnique({ where: { plate } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`License plate already exists: "${plate}"`);
    }
  }

  /**
   * Occupancy criterion shared with `TaxiCarAssignmentService` (design D11):
   * a car is busy while it holds a NEW/CONFIRMED order.
   */
  private async ensureCarsNotBusy(carIds: string[]) {
    if (carIds.length === 0) {
      return;
    }
    const busy = await this.prisma.taxiOrder.count({
      where: {
        carId: { in: carIds },
        status: { in: TAXI_CAR_BUSY_STATUSES },
      },
    });
    if (busy > 0) {
      throw new BadRequestException(
        'Car is busy with an active taxi order and cannot be deleted',
      );
    }
  }

  /**
   * Validates `featureServiceIds`: unknown ids → 404, services without the
   * `isCarFeature` flag → 400 (spec: только `isCarFeature`-услуги).
   * Returns the deduplicated id list or `undefined` when the field is absent.
   */
  private async resolveCarFeatures(
    featureServiceIds: string[] | undefined,
  ): Promise<string[] | undefined> {
    if (featureServiceIds === undefined) {
      return undefined;
    }
    if (!Array.isArray(featureServiceIds)) {
      throw new BadRequestException(
        'featureServiceIds must be an array of service ids',
      );
    }
    const ids = [...new Set(featureServiceIds)];
    if (ids.some((id) => typeof id !== 'string' || id.length === 0)) {
      throw new BadRequestException(
        'featureServiceIds must be an array of non-empty service ids',
      );
    }
    const services = await this.prisma.taxiExtraService.findMany({
      where: { id: { in: ids } },
    });
    if (services.length !== ids.length) {
      throw new NotFoundException('Car-feature service not found');
    }
    const notFeature = services.find((s) => !s.isCarFeature);
    if (notFeature) {
      throw new BadRequestException(
        `Service "${notFeature.name}" is not a car feature`,
      );
    }
    return ids;
  }

  private async requireDriver(driverId: string) {
    const driver = await this.prisma.taxiDriver.findUnique({
      where: { id: driverId },
      include: this.driverInclude,
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    return driver;
  }

  private async requireCarOfDriver(driverId: string, carId: string) {
    await this.requireDriver(driverId);
    const car = await this.prisma.taxiCar.findUnique({
      where: { id: carId },
      include: { features: true },
    });
    if (!car || car.driverId !== driverId) {
      throw new NotFoundException('Car not found');
    }
    return car;
  }

  /* --------------------------------- drivers --------------------------------- */

  async listDrivers(): Promise<TaxiDriverListDto> {
    return {
      drivers: await this.prisma.taxiDriver.findMany({
        include: this.driverInclude,
        orderBy: [{ createdAt: 'asc' }],
      }),
    };
  }

  async createDriver(dto: CreateTaxiDriverRequestDto) {
    const fullName = this.requireName(dto.fullName, 'fullName');
    const phone = this.requireName(dto.phone, 'phone');
    return this.prisma.taxiDriver.create({
      data: {
        fullName,
        phone,
        isActive: dto.isActive ?? true,
      },
      include: this.driverInclude,
    });
  }

  async updateDriver(id: string, dto: UpdateTaxiDriverRequestDto) {
    if (dto.fullName !== undefined) {
      dto = { ...dto, fullName: this.requireName(dto.fullName, 'fullName') };
    }
    if (dto.phone !== undefined) {
      dto = { ...dto, phone: this.requireName(dto.phone, 'phone') };
    }
    await this.requireExisting(id, 'Driver', () =>
      this.prisma.taxiDriver.findUnique({ where: { id } }),
    );
    return this.prisma.taxiDriver.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        isActive: dto.isActive,
      },
      include: this.driverInclude,
    });
  }

  /**
   * Deletes the driver together with his cars (FK cascade) — but only while
   * none of his cars holds an active (NEW/CONFIRMED) order (design D11).
   */
  async removeDriver(id: string) {
    const driver = await this.requireDriver(id);
    await this.ensureCarsNotBusy(driver.cars.map((car) => car.id));
    await this.prisma.taxiDriver.delete({ where: { id } });
  }

  /* ---------------------------------- cars ----------------------------------- */

  async listCars(driverId: string): Promise<TaxiCarListDto> {
    const driver = await this.requireDriver(driverId);
    return { cars: driver.cars };
  }

  async createCar(driverId: string, dto: CreateTaxiCarRequestDto) {
    await this.requireDriver(driverId);
    const model = this.requireName(dto.model, 'model');
    const plate = this.requirePlate(dto.plate);
    const seats = this.requirePositiveInt(dto.seats, 'seats');
    await this.ensurePlateFree(plate);
    const featureIds = await this.resolveCarFeatures(dto.featureServiceIds);
    return this.prisma.taxiCar.create({
      data: {
        model,
        plate,
        seats,
        color: dto.color ?? null,
        isActive: dto.isActive ?? true,
        driverId,
        features: featureIds
          ? { connect: featureIds.map((id) => ({ id })) }
          : undefined,
      },
      include: { features: true },
    });
  }

  async updateCar(
    driverId: string,
    carId: string,
    dto: UpdateTaxiCarRequestDto,
  ) {
    await this.requireCarOfDriver(driverId, carId);
    if (dto.plate !== undefined) {
      const plate = this.requirePlate(dto.plate);
      await this.ensurePlateFree(plate, carId);
      dto = { ...dto, plate };
    }
    if (dto.seats !== undefined) {
      dto = { ...dto, seats: this.requirePositiveInt(dto.seats, 'seats') };
    }
    if (dto.model !== undefined) {
      dto = { ...dto, model: this.requireName(dto.model, 'model') };
    }
    const featureIds = await this.resolveCarFeatures(dto.featureServiceIds);
    return this.prisma.taxiCar.update({
      where: { id: carId },
      data: {
        model: dto.model,
        plate: dto.plate,
        seats: dto.seats,
        color: dto.color,
        isActive: dto.isActive,
        features: featureIds
          ? { set: featureIds.map((id) => ({ id })) }
          : undefined,
      },
      include: { features: true },
    });
  }

  /** Deletion of a busy car is blocked by the shared occupancy criterion. */
  async removeCar(driverId: string, carId: string) {
    await this.requireCarOfDriver(driverId, carId);
    await this.ensureCarsNotBusy([carId]);
    await this.prisma.taxiCar.delete({ where: { id: carId } });
  }
}
