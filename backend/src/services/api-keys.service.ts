import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiKeyDto,
  ApiKeyListDto,
  ApiKeySecretDto,
  CreateApiKeyRequestDto,
  UpdateApiKeyRequestDto,
} from '../dto/api-key.dto.js';
import type { ApiKey } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateApiKey } from '../utils/generateApiKey.js';

/** Number of leading characters of a key that stay visible. */
const MASK_LENGTH = 8;

/** Accepted shape of every time value of this API: an ISO-8601 string. */
const ISO_8601 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?$/;

/**
 * Issues and manages the API keys of a user. The secret is generated
 * server-side and revealed only in the create response.
 */
@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a key for the user and returns it with the secret revealed. */
  async createForUser(
    userId: string,
    dto: CreateApiKeyRequestDto,
  ): Promise<ApiKeySecretDto> {
    const created = await this.prisma.apiKey.create({
      data: {
        key: generateApiKey(),
        name: this.normalizeName(dto.name),
        userId,
        isActive: dto.isActive ?? true,
        expiresAt: this.parseExpiresAt(dto.expiresAt),
      },
    });

    return this.toSecretDto(created);
  }

  /** All keys of the user, secrets masked. */
  async listForUser(userId: string): Promise<ApiKeyListDto> {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    return { items: keys.map((key) => this.toDto(key)), total: keys.length };
  }

  /** Renames / (de)activates / re-expires a key owned by the user. */
  async updateForUser(
    userId: string,
    keyId: string,
    dto: UpdateApiKeyRequestDto,
  ): Promise<ApiKeyDto> {
    const key = await this.findOwned(userId, keyId);
    const data: { name?: string; isActive?: boolean; expiresAt?: Date | null } =
      {};

    if (dto.name !== undefined) {
      data.name = this.normalizeName(dto.name);
    }
    if (dto.isActive !== undefined) {
      if (typeof dto.isActive !== 'boolean') {
        throw new BadRequestException('isActive must be a boolean');
      }
      data.isActive = dto.isActive;
    }
    if (dto.expiresAt !== undefined) {
      data.expiresAt = this.parseExpiresAt(dto.expiresAt);
    }

    const updated = await this.prisma.apiKey.update({
      where: { id: key.id },
      data,
    });

    return this.toDto(updated);
  }

  /** Permanently removes a key owned by the user. */
  async deleteForUser(userId: string, keyId: string): Promise<void> {
    const key = await this.findOwned(userId, keyId);
    await this.prisma.apiKey.delete({ where: { id: key.id } });
  }

  /** Leaves only the leading characters of the secret visible. */
  mask(key: string): string {
    return `${key.slice(0, MASK_LENGTH)}…`;
  }

  toDto(key: ApiKey): ApiKeyDto {
    return {
      id: key.id,
      key: this.mask(key.key),
      name: key.name,
      isActive: key.isActive,
      expiresAt: key.expiresAt?.toISOString() ?? null,
    } satisfies ApiKeyDto;
  }

  toSecretDto(key: ApiKey): ApiKeySecretDto {
    return {
      id: key.id,
      key: key.key,
      name: key.name,
      isActive: key.isActive,
      expiresAt: key.expiresAt?.toISOString() ?? null,
    } satisfies ApiKeySecretDto;
  }

  private async findOwned(userId: string, keyId: string): Promise<ApiKey> {
    const key = await this.prisma.apiKey.findUnique({ where: { id: keyId } });

    if (!key) {
      throw new NotFoundException('API key not found');
    }
    if (key.userId !== userId) {
      throw new ForbiddenException('API key belongs to another user');
    }

    return key;
  }

  private normalizeName(name?: string): string {
    const value = typeof name === 'string' ? name.trim() : '';
    if (!value) {
      throw new BadRequestException('Key name is required');
    }

    return value;
  }

  /** Empty/absent expiry means "never expires"; anything unparseable is a 400. */
  private parseExpiresAt(value?: string | null): Date | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    if (!ISO_8601.test(value)) {
      throw new BadRequestException(
        'expiresAt must be an ISO-8601 date-time string',
      );
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(
        'expiresAt must be an ISO-8601 date-time string',
      );
    }

    return parsed;
  }
}
