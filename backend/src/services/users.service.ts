import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminUserDto,
  AdminUserListDto,
  UpdateAdminUserRequestDto,
} from '../dto/admin-user.dto.js';
import type { ApiKey, User } from '../generated/prisma/client.js';
import { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApiKeysService } from './api-keys.service.js';

/** User row joined with its API keys. */
type UserWithKeys = User & { apiKeys: ApiKey[] };

/** CRUD of the user accounts, for administrators. */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeys: ApiKeysService,
  ) {}

  /** All accounts with their (masked) keys. */
  async list(): Promise<AdminUserListDto> {
    const users = await this.findWithKeys({});

    return {
      items: users.map((user) => this.toAdminDto(user)),
      total: users.length,
    };
  }

  async get(id: string): Promise<AdminUserDto> {
    return this.toAdminDto(await this.findOneWithKeys(id));
  }

  /** Activates/deactivates an account and/or changes its role. */
  async update(
    id: string,
    dto: UpdateAdminUserRequestDto,
  ): Promise<AdminUserDto> {
    const existing = await this.findOneWithKeys(id);
    const data: { isActive?: boolean; role?: Role } = {};

    if (dto.isActive !== undefined) {
      if (typeof dto.isActive !== 'boolean') {
        throw new BadRequestException('isActive must be a boolean');
      }
      data.isActive = dto.isActive;
    }
    if (dto.role !== undefined) {
      data.role = this.toRole(dto.role);
    }

    const user = await this.prisma.user.update({
      where: { id: existing.id },
      data,
      include: { apiKeys: { orderBy: { createdAt: 'asc' } } },
    });

    return this.toAdminDto(user);
  }

  /**
   * Deletes the account; its keys are removed by the cascade relation. An
   * admin cannot remove the very account they are authenticated with.
   */
  async remove(id: string, actorId?: string): Promise<void> {
    const existing = await this.findOneWithKeys(id);
    if (actorId !== undefined && existing.id === actorId) {
      throw new ForbiddenException('You cannot delete your own account');
    }
    await this.prisma.user.delete({ where: { id: existing.id } });
  }

  private toAdminDto(user: UserWithKeys): AdminUserDto {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      apiKeys: user.apiKeys.map((key) => this.apiKeys.toDto(key)),
    } satisfies AdminUserDto;
  }

  private async findOneWithKeys(id: string): Promise<UserWithKeys> {
    const users = await this.findWithKeys({ id });
    if (!users[0]) {
      throw new NotFoundException('User not found');
    }

    return users[0];
  }

  private findWithKeys(where: { id?: string }): Promise<UserWithKeys[]> {
    return this.prisma.user.findMany({
      where,
      include: { apiKeys: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private toRole(value?: string): Role {
    const role = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (!Object.hasOwn(Role, role)) {
      throw new BadRequestException(
        `role must be one of: ${Object.keys(Role).join(', ')}`,
      );
    }

    return Role[role as keyof typeof Role];
  }
}
