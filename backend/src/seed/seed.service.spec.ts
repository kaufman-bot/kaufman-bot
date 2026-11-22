import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../generated/prisma/client.js';
import { SeedService } from './seed.service.js';

const makePrismaMock = () => {
  const userUpsert = vi.fn().mockResolvedValue({ id: 'user-id', email: '' });
  const apiKeyUpsert = vi
    .fn()
    .mockResolvedValue({ id: 'key-id', name: '', key: '' });

  // Taxi dictionary delegates: every table starts empty so the taxi seed
  // runs createMany on each; individual tests override count() per table.
  const taxiTables = [
    'taxiCity',
    'taxiExtraService',
    'taxiDepartureSlot',
    'taxiPassengerOption',
  ] as const;
  const taxiCounts = Object.fromEntries(
    taxiTables.map((t) => [t, vi.fn().mockResolvedValue(0)]),
  );
  const taxiCreateMany = Object.fromEntries(
    taxiTables.map((t) => [t, vi.fn().mockResolvedValue({ count: 1 })]),
  );

  return {
    instance: {
      user: { upsert: userUpsert },
      apiKey: { upsert: apiKeyUpsert },
      ...Object.fromEntries(
        taxiTables.map((t) => [
          t,
          { count: taxiCounts[t], createMany: taxiCreateMany[t] },
        ]),
      ),
    },
    userUpsert,
    apiKeyUpsert,
    taxiCounts,
    taxiCreateMany,
  };
};

const setEnv = (
  prefix: string,
  email: string,
  password: string,
  key: string,
) => {
  process.env[`${prefix}_EMAIL`] = email;
  process.env[`${prefix}_PASSWORD`] = password;
  process.env[`${prefix}_API_KEY`] = key;
};

const clearEnv = (prefix: string) => {
  delete process.env[`${prefix}_EMAIL`];
  delete process.env[`${prefix}_PASSWORD`];
  delete process.env[`${prefix}_API_KEY`];
};

describe('SeedService.seedDefaultUser (via onApplicationBootstrap)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs?.();
    clearEnv('USER1');
    clearEnv('USER2');
    delete process.env['ADMIN_EMAIL'];
    delete process.env['ADMIN_PASSWORD'];
    delete process.env['ADMIN_API_KEY'];
  });

  it('should seed both USER1 and USER2 when all env vars are set', async () => {
    setEnv('USER1', 'u1@example.com', 'pass-user-1', 'sk-user-1');
    setEnv('USER2', 'u2@example.com', 'pass-user-2', 'sk-user-2');

    const prisma = makePrismaMock();
    const service = new SeedService(prisma.instance as never);

    await service.onApplicationBootstrap();

    expect(prisma.userUpsert).toHaveBeenCalledTimes(2);
    expect(prisma.apiKeyUpsert).toHaveBeenCalledTimes(2);

    expect(prisma.userUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'u1@example.com' },
        create: expect.objectContaining({
          email: 'u1@example.com',
          role: Role.USER,
        }),
      }),
    );
    expect(prisma.userUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'u2@example.com' },
        create: expect.objectContaining({
          email: 'u2@example.com',
          role: Role.USER,
        }),
      }),
    );
  });

  it('should skip a user when any env var is missing and still seed the other', async () => {
    setEnv('USER1', 'u1@example.com', 'pass-user-1', 'sk-user-1');
    // USER2 missing entirely

    const prisma = makePrismaMock();
    const service = new SeedService(prisma.instance as never);

    await service.onApplicationBootstrap();

    expect(prisma.userUpsert).toHaveBeenCalledTimes(1);
    expect(prisma.apiKeyUpsert).toHaveBeenCalledTimes(1);
    expect(prisma.userUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'u1@example.com' } }),
    );
  });

  it('should skip a user when only one env var is missing for that prefix', async () => {
    setEnv('USER1', 'u1@example.com', 'pass-user-1', 'sk-user-1');
    setEnv('USER2', 'u2@example.com', 'pass-user-2', ''); // empty API key

    const prisma = makePrismaMock();
    const service = new SeedService(prisma.instance as never);

    await service.onApplicationBootstrap();

    expect(prisma.userUpsert).toHaveBeenCalledTimes(1);
    expect(prisma.userUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'u1@example.com' } }),
    );
  });

  it('should not duplicate users on repeated calls (idempotent upsert)', async () => {
    setEnv('USER1', 'u1@example.com', 'pass-user-1', 'sk-user-1');
    setEnv('USER2', 'u2@example.com', 'pass-user-2', 'sk-user-2');

    const prisma = makePrismaMock();
    const service = new SeedService(prisma.instance as never);

    await service.onApplicationBootstrap();
    await service.onApplicationBootstrap();

    // upsert is called twice per run (USER1 + USER2) × 2 runs = 4 calls total
    expect(prisma.userUpsert).toHaveBeenCalledTimes(4);
    // Each call uses the same where-clause for the same email (idempotent)
    const whereEmails = prisma.userUpsert.mock.calls.map(
      ([arg]) => (arg as { where: { email: string } }).where.email,
    );
    expect(whereEmails).toEqual([
      'u1@example.com',
      'u2@example.com',
      'u1@example.com',
      'u2@example.com',
    ]);
  });

  it('should hash the password before persisting', async () => {
    setEnv('USER1', 'u1@example.com', 's3cret', 'sk-user-1');

    const prisma = makePrismaMock();
    const service = new SeedService(prisma.instance as never);

    await service.onApplicationBootstrap();

    const createPayload = prisma.userUpsert.mock.calls[0][0] as {
      create: { password: string };
    };
    // scrypt hash format: salt:hash (hex)
    expect(createPayload.create.password).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(createPayload.create.password).not.toContain('s3cret');
  });

  it('should attach the API key to the created user via userId', async () => {
    setEnv('USER1', 'u1@example.com', 'pass-user-1', 'sk-user-1');

    const prisma = makePrismaMock();
    prisma.userUpsert.mockResolvedValueOnce({
      id: 'user-42',
      email: 'u1@example.com',
    });
    const service = new SeedService(prisma.instance as never);

    await service.onApplicationBootstrap();

    expect(prisma.apiKeyUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          key: 'sk-user-1',
          name: 'Default USER1 key',
          userId: 'user-42',
        }),
      }),
    );
  });
});

describe('SeedService.seedTaxiDictionaries (via onApplicationBootstrap)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs?.();
    clearEnv('USER1');
    clearEnv('USER2');
    delete process.env['ADMIN_EMAIL'];
    delete process.env['ADMIN_PASSWORD'];
    delete process.env['ADMIN_API_KEY'];
  });

  it('should seed all four taxi dictionaries when every table is empty', async () => {
    const prisma = makePrismaMock();
    const service = new SeedService(prisma.instance as never);

    await service.onApplicationBootstrap();

    const cities = prisma.taxiCreateMany.taxiCity.mock.calls[0][0]
      .data as Array<{ name: string; distanceKm: number }>;
    expect(cities).toHaveLength(7);
    expect(cities.map((c) => c.name)).toEqual([
      'Москва',
      'Тверь',
      'Вышний Волочёк',
      'Бологое',
      'Великий Новгород',
      'Чудово',
      'Санкт-Петербург',
    ]);
    expect(cities[0].distanceKm).toBe(0);
    expect(cities[6].distanceKm).toBe(700);

    const services = prisma.taxiCreateMany.taxiExtraService.mock.calls[0][0]
      .data as Array<{ name: string; isCarFeature: boolean }>;
    expect(services).toHaveLength(9);
    // Car-feature services (child seat etc.) are required by the wizard
    // matching (design D11) and must be flagged at seed time.
    expect(services.filter((s) => s.isCarFeature).map((s) => s.name)).toEqual([
      'Детское кресло',
      'Перевозка животных',
      'Курение в салоне',
      'Кондиционер',
      'Музыка в салоне',
    ]);

    const slots = prisma.taxiCreateMany.taxiDepartureSlot.mock.calls[0][0]
      .data as Array<{ time: string }>;
    expect(slots.map((s) => s.time)).toEqual([
      '08:00',
      '12:00',
      '16:00',
      '20:00',
    ]);

    const passengers = prisma.taxiCreateMany.taxiPassengerOption.mock
      .calls[0][0].data as Array<{ count: number }>;
    expect(passengers.map((p) => p.count)).toEqual([1, 2, 3, 4]);
  });

  it('should not overwrite non-empty dictionaries on repeated runs', async () => {
    const prisma = makePrismaMock();
    // Admin already has data in every dictionary.
    prisma.taxiCounts.taxiCity.mockResolvedValue(7);
    prisma.taxiCounts.taxiExtraService.mockResolvedValue(9);
    prisma.taxiCounts.taxiDepartureSlot.mockResolvedValue(4);
    prisma.taxiCounts.taxiPassengerOption.mockResolvedValue(4);
    const service = new SeedService(prisma.instance as never);

    await service.onApplicationBootstrap();
    await service.onApplicationBootstrap();

    for (const table of [
      'taxiCity',
      'taxiExtraService',
      'taxiDepartureSlot',
      'taxiPassengerOption',
    ] as const) {
      expect(prisma.taxiCreateMany[table]).not.toHaveBeenCalled();
    }
  });

  it('should seed only the empty dictionary and keep modified ones', async () => {
    const prisma = makePrismaMock();
    // Partially modified: only the services table is still empty.
    prisma.taxiCounts.taxiCity.mockResolvedValue(5);
    prisma.taxiCounts.taxiExtraService.mockResolvedValue(0);
    prisma.taxiCounts.taxiDepartureSlot.mockResolvedValue(4);
    prisma.taxiCounts.taxiPassengerOption.mockResolvedValue(2);
    const service = new SeedService(prisma.instance as never);

    await service.onApplicationBootstrap();

    expect(prisma.taxiCreateMany.taxiExtraService).toHaveBeenCalledTimes(1);
    expect(prisma.taxiCreateMany.taxiCity).not.toHaveBeenCalled();
    expect(prisma.taxiCreateMany.taxiDepartureSlot).not.toHaveBeenCalled();
    expect(prisma.taxiCreateMany.taxiPassengerOption).not.toHaveBeenCalled();
  });
});
