import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiKey, User } from '../generated/prisma/client.js';
import type { Language } from '../generated/prisma/enums.js';
import { ApiKeysService } from './api-keys.service.js';
import { AuthService } from './auth.service.js';

const makePrismaMock = () => {
  const userUpdate = vi.fn();
  return {
    userUpdate,
    instance: { user: { update: userUpdate } } as unknown as never,
  };
};

const makeApiKeysMock = () => {
  const toDto = vi.fn().mockReturnValue({
    id: 'key-1',
    key: 'sk-masked…',
    name: 'Default key',
    isActive: true,
    expiresAt: null,
  });
  return { toDto, instance: { toDto } as unknown as ApiKeysService };
};

const makeUser = (timezone: string | null = null, language: Language = 'en') =>
  ({
    id: 'user-1',
    email: 'test@example.com',
    password: 'hashed',
    role: 'USER',
    isActive: true,
    timezone,
    language,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as User;

const apiKey = { id: 'key-1' } as ApiKey;

describe('AuthService.updateProfile', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let apiKeysMock: ReturnType<typeof makeApiKeysMock>;
  let service: AuthService;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    apiKeysMock = makeApiKeysMock();
    service = new AuthService(prismaMock.instance, apiKeysMock.instance);
  });

  it('stores a valid IANA time zone (trimmed) and returns the profile', async () => {
    const updated = makeUser('Europe/Moscow');
    prismaMock.userUpdate.mockResolvedValue(updated);

    const result = await service.updateProfile(makeUser(), apiKey, {
      timezone: '  Europe/Moscow  ',
    });

    expect(prismaMock.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { timezone: 'Europe/Moscow', language: 'en' },
    });
    expect(result.user.timezone).toBe('Europe/Moscow');
    expect(apiKeysMock.toDto).toHaveBeenCalledWith(apiKey);
  });

  it('rejects a non-IANA time zone without touching the account', async () => {
    await expect(
      service.updateProfile(makeUser(), apiKey, {
        timezone: 'Mars/Olympus',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.userUpdate).not.toHaveBeenCalled();
  });

  it('rejects an empty time zone without touching the account', async () => {
    await expect(
      service.updateProfile(makeUser(), apiKey, { timezone: '   ' }),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.userUpdate).not.toHaveBeenCalled();
  });

  it('clears the time zone when null is sent', async () => {
    prismaMock.userUpdate.mockResolvedValue(makeUser(null));

    const result = await service.updateProfile(
      makeUser('Europe/Moscow'),
      apiKey,
      { timezone: null },
    );

    expect(prismaMock.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { timezone: null, language: 'en' },
    });
    expect(result.user.timezone).toBeNull();
  });

  it('keeps the stored time zone when the field is absent', async () => {
    prismaMock.userUpdate.mockResolvedValue(makeUser('Europe/Moscow'));

    const result = await service.updateProfile(
      makeUser('Europe/Moscow'),
      apiKey,
      {},
    );

    expect(prismaMock.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { timezone: 'Europe/Moscow', language: 'en' },
    });
    expect(result.user.timezone).toBe('Europe/Moscow');
  });

  it('stores a supported language (trimmed, case insensitive)', async () => {
    prismaMock.userUpdate.mockResolvedValue(makeUser(null, 'ru'));

    const result = await service.updateProfile(makeUser(), apiKey, {
      language: ' RU ',
    });

    expect(prismaMock.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { timezone: null, language: 'ru' },
    });
    expect(result.user.language).toBe('ru');
  });

  it('rejects a language outside the supported set without touching the account', async () => {
    await expect(
      service.updateProfile(makeUser(), apiKey, { language: 'de' }),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.userUpdate).not.toHaveBeenCalled();
  });

  it('keeps the stored language when the field is absent', async () => {
    prismaMock.userUpdate.mockResolvedValue(makeUser('Europe/Moscow', 'ru'));

    const result = await service.updateProfile(
      makeUser('Europe/Moscow', 'ru'),
      apiKey,
      { timezone: 'Europe/Moscow' },
    );

    expect(prismaMock.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { timezone: 'Europe/Moscow', language: 'ru' },
    });
    expect(result.user.language).toBe('ru');
  });

  it('writes time zone and language in a single update', async () => {
    prismaMock.userUpdate.mockResolvedValue(makeUser('Europe/Berlin', 'ru'));

    await service.updateProfile(makeUser(), apiKey, {
      timezone: 'Europe/Berlin',
      language: 'ru',
    });

    expect(prismaMock.userUpdate).toHaveBeenCalledTimes(1);
    expect(prismaMock.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { timezone: 'Europe/Berlin', language: 'ru' },
    });
  });
});
