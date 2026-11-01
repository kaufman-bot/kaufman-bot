import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../generated/prisma/client.js';
import { SeedService } from './seed.service.js';

const makePrismaMock = () => {
  const userUpsert = vi.fn().mockResolvedValue({ id: 'user-id', email: '' });
  const apiKeyUpsert = vi
    .fn()
    .mockResolvedValue({ id: 'key-id', name: '', key: '' });

  return {
    instance: {
      user: { upsert: userUpsert },
      apiKey: { upsert: apiKeyUpsert },
    },
    userUpsert,
    apiKeyUpsert,
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
