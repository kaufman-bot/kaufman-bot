import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  AuthProfileDto,
  AuthProfileUserDto,
  AuthRegisterDto,
  RegisterRequestDto,
} from '../dto/auth.dto.js';
import type { ApiKey, User } from '../generated/prisma/client.js';
import { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword } from '../utils/hashPassword.js';
import { ApiKeysService } from './api-keys.service.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Minimum password length enforced by the registration endpoint. */
const MIN_PASSWORD_LENGTH = 8;

/** Name of the key issued automatically on registration. */
const DEFAULT_KEY_NAME = 'Default key';

/**
 * Authentication use cases. Registration is a workflow (validate the
 * credentials, create the account, issue its first key) rather than a CRUD
 * operation, so it lives here and not in UsersService, which only manages
 * account rows.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeys: ApiKeysService,
  ) {}

  /** Creates a USER account and its first API key (secret revealed once). */
  async register(dto: RegisterRequestDto): Promise<AuthRegisterDto> {
    const email = this.normalizeEmail(dto.email?.trim());
    const password = this.normalizePassword(dto.password?.trim());

    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('User with this e-mail already exists');
    }

    const user = await this.prisma.user.create({
      data: { email, password: hashPassword(password), role: Role.USER },
    });
    const apiKey = await this.apiKeys.createForUser(user.id, {
      name: DEFAULT_KEY_NAME,
    });

    return { user: this.toProfile(user), apiKey } satisfies AuthRegisterDto;
  }

  /**
   * Payload of GET /auth/me, built from the request the ApiKeyGuard has
   * already resolved (the key secret is masked by ApiKeysService.toDto).
   */
  profile(user: User, apiKey: ApiKey): AuthProfileDto {
    return {
      user: this.toProfile(user),
      apiKey: this.apiKeys.toDto(apiKey),
    } satisfies AuthProfileDto;
  }

  private toProfile(user: User): AuthProfileUserDto {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    } satisfies AuthProfileUserDto;
  }

  private normalizeEmail(value?: string): string {
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!EMAIL.test(email)) {
      throw new BadRequestException('A valid e-mail is required');
    }

    return email;
  }

  private normalizePassword(value?: string): string {
    const password = typeof value === 'string' ? value : '';
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    return password;
  }
}
