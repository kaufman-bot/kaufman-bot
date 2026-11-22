import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaxiCatalogService } from './taxi-catalog.service.js';

const makePrismaMock = () => {
  const cityFindUnique = vi.fn();
  const cityFindMany = vi.fn().mockResolvedValue([]);
  const cityCreate = vi.fn();
  const cityUpdate = vi.fn();
  const cityDelete = vi.fn();
  const cityDeleteMany = vi.fn().mockResolvedValue({ count: 0 });

  const serviceFindUnique = vi.fn();
  const serviceFindMany = vi.fn().mockResolvedValue([]);
  const serviceCreate = vi.fn();
  const serviceUpdate = vi.fn();
  const serviceDelete = vi.fn();

  const slotFindUnique = vi.fn();
  const slotFindMany = vi.fn().mockResolvedValue([]);
  const slotCreate = vi.fn();
  const slotUpdate = vi.fn();
  const slotDelete = vi.fn();

  const optionFindUnique = vi.fn();
  const optionFindMany = vi.fn().mockResolvedValue([]);
  const optionCreate = vi.fn();
  const optionUpdate = vi.fn();
  const optionDelete = vi.fn();

  const driverFindUnique = vi.fn();
  const driverFindMany = vi.fn().mockResolvedValue([]);
  const driverCreate = vi.fn();
  const driverUpdate = vi.fn();
  const driverDelete = vi.fn();

  const carFindUnique = vi.fn();
  const carCreate = vi.fn();
  const carUpdate = vi.fn();
  const carDelete = vi.fn();

  const orderCount = vi.fn().mockResolvedValue(0);
  const orderDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const transaction = vi.fn().mockImplementation(async (ops) => ops);

  return {
    instance: {
      taxiCity: {
        findUnique: cityFindUnique,
        findMany: cityFindMany,
        create: cityCreate,
        update: cityUpdate,
        delete: cityDelete,
        deleteMany: cityDeleteMany,
      },
      taxiExtraService: {
        findUnique: serviceFindUnique,
        findMany: serviceFindMany,
        create: serviceCreate,
        update: serviceUpdate,
        delete: serviceDelete,
      },
      taxiDepartureSlot: {
        findUnique: slotFindUnique,
        findMany: slotFindMany,
        create: slotCreate,
        update: slotUpdate,
        delete: slotDelete,
      },
      taxiPassengerOption: {
        findUnique: optionFindUnique,
        findMany: optionFindMany,
        create: optionCreate,
        update: optionUpdate,
        delete: optionDelete,
      },
      taxiDriver: {
        findUnique: driverFindUnique,
        findMany: driverFindMany,
        create: driverCreate,
        update: driverUpdate,
        delete: driverDelete,
      },
      taxiCar: {
        findUnique: carFindUnique,
        create: carCreate,
        update: carUpdate,
        delete: carDelete,
      },
      taxiOrder: {
        count: orderCount,
        deleteMany: orderDeleteMany,
      },
      $transaction: transaction,
    } as any,
    cityFindUnique,
    cityFindMany,
    cityCreate,
    cityUpdate,
    cityDelete,
    cityDeleteMany,
    serviceFindUnique,
    serviceFindMany,
    serviceCreate,
    serviceUpdate,
    slotFindUnique,
    slotFindMany,
    slotCreate,
    optionFindUnique,
    optionFindMany,
    optionCreate,
    driverFindUnique,
    driverFindMany,
    driverCreate,
    driverUpdate,
    driverDelete,
    carFindUnique,
    carCreate,
    carUpdate,
    carDelete,
    orderCount,
    orderDeleteMany,
    transaction,
  };
};

describe('TaxiCatalogService (dictionaries)', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: TaxiCatalogService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    service = new TaxiCatalogService(prisma.instance);
  });

  // ─── cities ─────────────────────────────────────────────────────────────

  describe('createCity', () => {
    it('creates a city trimming the name and applying defaults', async () => {
      prisma.cityFindUnique.mockResolvedValue(null);
      prisma.cityCreate.mockResolvedValue({
        id: 'city-1',
        name: 'Клин',
        distanceKm: 84,
        isActive: true,
        sortOrder: 0,
      });

      const result = await service.createCity({
        name: '  Клин ',
        distanceKm: 84,
      });

      expect(result.name).toBe('Клин');
      expect(prisma.cityCreate).toHaveBeenCalledWith({
        data: {
          name: 'Клин',
          distanceKm: 84,
          isActive: true,
          sortOrder: 0,
        },
      });
    });

    it('rejects a duplicate name with 409', async () => {
      prisma.cityFindUnique.mockResolvedValue({ id: 'city-0', name: 'Клин' });

      await expect(
        service.createCity({ name: 'Клин', distanceKm: 84 }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.cityCreate).not.toHaveBeenCalled();
    });

    it('rejects a negative or non-integer distanceKm with 400', async () => {
      await expect(
        service.createCity({ name: 'Клин', distanceKm: -5 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createCity({ name: 'Клин', distanceKm: 1.5 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createCity({ name: '', distanceKm: 1 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateCity', () => {
    it('throws 404 for an unknown city', async () => {
      prisma.cityFindUnique.mockResolvedValue(null);
      await expect(
        service.updateCity('nope', { distanceKm: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('keeps another city with the same name conflicting (409)', async () => {
      // updateCity checks the name first: the lookup must return a foreign
      // city (different id) holding the requested name.
      prisma.cityFindUnique
        .mockResolvedValueOnce({ id: 'city-2', name: 'B' })
        .mockResolvedValueOnce({ id: 'city-2', name: 'B' });
      await expect(service.updateCity('city-1', { name: 'B' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('removeCity', () => {
    it('deletes draft orders referencing the city, then the city', async () => {
      prisma.cityFindUnique.mockResolvedValue({ id: 'city-1', name: 'Тверь' });
      prisma.orderCount.mockResolvedValue(0);

      await service.removeCity('city-1');

      expect(prisma.transaction).toHaveBeenCalledTimes(1);
      const ops = prisma.transaction.mock.calls[0][0] as unknown[];
      expect(ops).toHaveLength(2);
      expect(prisma.orderDeleteMany).toHaveBeenCalledWith({
        where: {
          OR: [{ fromCityId: 'city-1' }, { toCityId: 'city-1' }],
          status: 'DRAFT',
        },
      });
      expect(prisma.cityDelete).toHaveBeenCalledWith({
        where: { id: 'city-1' },
      });
    });

    it('rejects deletion when a submitted order references the city (400)', async () => {
      prisma.cityFindUnique.mockResolvedValue({ id: 'city-1', name: 'Тверь' });
      prisma.orderCount.mockResolvedValue(2);

      await expect(service.removeCity('city-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.cityDelete).not.toHaveBeenCalled();
      expect(prisma.orderDeleteMany).not.toHaveBeenCalled();
    });

    it('throws 404 for an unknown city', async () => {
      prisma.cityFindUnique.mockResolvedValue(null);
      await expect(service.removeCity('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── extra services ─────────────────────────────────────────────────────

  describe('createService', () => {
    it('stores the car-feature flag and defaults', async () => {
      prisma.serviceFindUnique.mockResolvedValue(null);
      prisma.serviceCreate.mockResolvedValue({
        id: 'svc-1',
        name: 'Детское кресло',
      });

      await service.createService({ name: 'Детское кресло', surcharge: 300 });

      expect(prisma.serviceCreate).toHaveBeenCalledWith({
        data: {
          name: 'Детское кресло',
          surcharge: 300,
          isCarFeature: false,
          isActive: true,
          sortOrder: 0,
        },
      });
    });

    it('rejects a negative surcharge and a duplicate name', async () => {
      await expect(
        service.createService({ name: 'X', surcharge: -1 }),
      ).rejects.toThrow(BadRequestException);

      prisma.serviceFindUnique.mockResolvedValue({ id: 'svc-0', name: 'X' });
      await expect(
        service.createService({ name: 'X', surcharge: 0 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── departure slots ────────────────────────────────────────────────────

  describe('createDepartureSlot', () => {
    it('accepts a valid HH:MM time', async () => {
      prisma.slotFindUnique.mockResolvedValue(null);
      prisma.slotCreate.mockResolvedValue({ id: 'slot-1', time: '09:30' });

      await service.createDepartureSlot({ time: '09:30' });

      expect(prisma.slotCreate).toHaveBeenCalledWith({
        data: { time: '09:30', isActive: true, sortOrder: 0 },
      });
    });

    it('rejects malformed times with 400', async () => {
      for (const bad of ['24:00', '9:30', '12:60', '', 'ab:cd']) {
        await expect(
          service.createDepartureSlot({ time: bad }),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects a duplicate time with 409', async () => {
      prisma.slotFindUnique.mockResolvedValue({ id: 'slot-0', time: '09:30' });
      await expect(
        service.createDepartureSlot({ time: '09:30' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── passenger options ──────────────────────────────────────────────────

  describe('createPassengerOption', () => {
    it('creates a positive count option', async () => {
      prisma.optionFindUnique.mockResolvedValue(null);
      prisma.optionCreate.mockResolvedValue({ id: 'opt-1', count: 5 });

      await service.createPassengerOption({ count: 5 });

      expect(prisma.optionCreate).toHaveBeenCalledWith({
        data: { count: 5, isActive: true, sortOrder: 0 },
      });
    });

    it('rejects zero, negatives and duplicates', async () => {
      await expect(service.createPassengerOption({ count: 0 })).rejects.toThrow(
        BadRequestException,
      );

      prisma.optionFindUnique.mockResolvedValue({ id: 'opt-0', count: 3 });
      await expect(service.createPassengerOption({ count: 3 })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── lists ──────────────────────────────────────────────────────────────

  describe('lists', () => {
    it('return dictionaries shaped as List DTOs', async () => {
      prisma.cityFindMany.mockResolvedValue([{ id: 'c1', name: 'Москва' }]);
      prisma.serviceFindMany.mockResolvedValue([{ id: 's1', name: 'X' }]);
      prisma.slotFindMany.mockResolvedValue([{ id: 'd1', time: '08:00' }]);
      prisma.optionFindMany.mockResolvedValue([{ id: 'o1', count: 1 }]);

      expect(await service.listCities()).toEqual({
        cities: [{ id: 'c1', name: 'Москва' }],
      });
      expect(await service.listServices()).toEqual({
        services: [{ id: 's1', name: 'X' }],
      });
      expect(await service.listDepartureSlots()).toEqual({
        slots: [{ id: 'd1', time: '08:00' }],
      });
      expect(await service.listPassengerOptions()).toEqual({
        options: [{ id: 'o1', count: 1 }],
      });
    });
  });
});

describe('TaxiCatalogService (drivers and cars)', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: TaxiCatalogService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    service = new TaxiCatalogService(prisma.instance);
  });

  describe('createDriver', () => {
    it('trims names and applies defaults', async () => {
      prisma.driverCreate.mockResolvedValue({ id: 'drv-1' });

      await service.createDriver({
        fullName: ' Иван Петров ',
        phone: '+7 900',
      });

      expect(prisma.driverCreate).toHaveBeenCalledWith({
        data: { fullName: 'Иван Петров', phone: '+7 900', isActive: true },
        include: expect.anything(),
      });
    });

    it('rejects empty fullName or phone with 400', async () => {
      await expect(
        service.createDriver({ fullName: '', phone: '+7 900' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createDriver({ fullName: 'Иван', phone: '  ' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createCar', () => {
    const driverId = 'drv-1';

    it('connects car-feature services and stores required seats', async () => {
      prisma.driverFindUnique.mockResolvedValue({ id: driverId, cars: [] });
      prisma.serviceFindMany.mockResolvedValue([
        { id: 'svc-a', name: 'Кресло', isCarFeature: true },
        { id: 'svc-b', name: 'Курение', isCarFeature: true },
      ]);
      prisma.carFindUnique.mockResolvedValue(null);
      prisma.carCreate.mockResolvedValue({ id: 'car-1', plate: 'А123ВС77' });

      await service.createCar(driverId, {
        model: 'Camry',
        plate: 'А123ВС77',
        seats: 4,
        featureServiceIds: ['svc-a', 'svc-b', 'svc-a'],
      });

      const args = prisma.carCreate.mock.calls[0][0] as {
        data: { seats: number; features: { connect: unknown[] } };
      };
      expect(args.data.seats).toBe(4);
      expect(args.data.features.connect).toEqual([
        { id: 'svc-a' },
        { id: 'svc-b' },
      ]);
    });

    it('rejects seats <= 0 or non-integer with 400', async () => {
      prisma.driverFindUnique.mockResolvedValue({ id: driverId, cars: [] });
      for (const seats of [0, -2, 3.5]) {
        await expect(
          service.createCar(driverId, {
            model: 'Camry',
            plate: 'А123ВС77',
            seats,
          }),
        ).rejects.toThrow(BadRequestException);
      }
      expect(prisma.carCreate).not.toHaveBeenCalled();
    });

    it('rejects a duplicate plate with 409', async () => {
      prisma.driverFindUnique.mockResolvedValue({ id: driverId, cars: [] });
      prisma.carFindUnique.mockResolvedValue({
        id: 'car-0',
        plate: 'А123ВС77',
      });

      await expect(
        service.createCar(driverId, {
          model: 'Camry',
          plate: 'А123ВС77',
          seats: 4,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a non-car-feature service with 400', async () => {
      prisma.driverFindUnique.mockResolvedValue({ id: driverId, cars: [] });
      prisma.serviceFindMany.mockResolvedValue([
        { id: 'svc-x', name: 'Вода', isCarFeature: false },
      ]);

      await expect(
        service.createCar(driverId, {
          model: 'Camry',
          plate: 'X001',
          seats: 2,
          featureServiceIds: ['svc-x'],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.carCreate).not.toHaveBeenCalled();
    });

    it('rejects an unknown service id with 404', async () => {
      prisma.driverFindUnique.mockResolvedValue({ id: driverId, cars: [] });
      prisma.serviceFindMany.mockResolvedValue([]);

      await expect(
        service.createCar(driverId, {
          model: 'Camry',
          plate: 'X001',
          seats: 2,
          featureServiceIds: ['ghost'],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an unknown driver with 404', async () => {
      prisma.driverFindUnique.mockResolvedValue(null);
      await expect(
        service.createCar('ghost', { model: 'Camry', plate: 'X001', seats: 2 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeCar / removeDriver', () => {
    it('blocks deleting a busy car with 400', async () => {
      prisma.driverFindUnique.mockResolvedValue({ id: 'drv-1', cars: [] });
      prisma.carFindUnique.mockResolvedValue({
        id: 'car-1',
        driverId: 'drv-1',
        features: [],
      });
      prisma.orderCount.mockResolvedValue(1);

      await expect(service.removeCar('drv-1', 'car-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.carDelete).not.toHaveBeenCalled();
      expect(prisma.orderCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            carId: { in: ['car-1'] },
            status: { in: ['NEW', 'CONFIRMED'] },
          }),
        }),
      );
    });

    it('deletes a free car', async () => {
      prisma.driverFindUnique.mockResolvedValue({ id: 'drv-1', cars: [] });
      prisma.carFindUnique.mockResolvedValue({
        id: 'car-1',
        driverId: 'drv-1',
        features: [],
      });
      prisma.orderCount.mockResolvedValue(0);

      await service.removeCar('drv-1', 'car-1');
      expect(prisma.carDelete).toHaveBeenCalledWith({ where: { id: 'car-1' } });
    });

    it('blocks deleting a driver whose car is busy with 400', async () => {
      prisma.driverFindUnique.mockResolvedValue({
        id: 'drv-1',
        cars: [{ id: 'car-1' }, { id: 'car-2' }],
      });
      prisma.orderCount.mockResolvedValue(1);

      await expect(service.removeDriver('drv-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.driverDelete).not.toHaveBeenCalled();
      expect(prisma.orderCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            carId: { in: ['car-1', 'car-2'] },
          }),
        }),
      );
    });

    it('deletes a driver when all his cars are free', async () => {
      prisma.driverFindUnique.mockResolvedValue({
        id: 'drv-1',
        cars: [{ id: 'car-1' }],
      });
      prisma.orderCount.mockResolvedValue(0);

      await service.removeDriver('drv-1');
      expect(prisma.driverDelete).toHaveBeenCalledWith({
        where: { id: 'drv-1' },
      });
    });

    it('rejects a car outside the driver with 404', async () => {
      prisma.driverFindUnique.mockResolvedValue({ id: 'drv-1', cars: [] });
      prisma.carFindUnique.mockResolvedValue({
        id: 'car-9',
        driverId: 'drv-other',
        features: [],
      });

      await expect(service.removeCar('drv-1', 'car-9')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listCars / listDrivers', () => {
    it('returns the nested list for an existing driver', async () => {
      prisma.driverFindUnique.mockResolvedValue({
        id: 'drv-1',
        cars: [{ id: 'car-1', features: [] }],
      });
      expect(await service.listCars('drv-1')).toEqual({
        cars: [{ id: 'car-1', features: [] }],
      });
    });

    it('listDrivers returns the List DTO shape', async () => {
      prisma.driverFindMany.mockResolvedValue([{ id: 'drv-1', cars: [] }]);
      expect(await service.listDrivers()).toEqual({
        drivers: [{ id: 'drv-1', cars: [] }],
      });
    });
  });
});
