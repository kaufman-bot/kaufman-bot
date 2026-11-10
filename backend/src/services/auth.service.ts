import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthProfileDto,
  AuthProfileUserDto,
  AuthRegisterDto,
  LoginRequestDto,
  RegisterRequestDto,
  UpdateProfileRequestDto,
} from '../dto/auth.dto.js';
import type { ApiKey, User } from '../generated/prisma/client.js';
import { Role } from '../generated/prisma/client.js';
import type { Language } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword } from '../utils/hashPassword.js';
import { normalizeLanguage, SUPPORTED_LANGUAGES } from '../utils/language.js';
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

    return {
      user: await this.toProfile(user),
      apiKey,
    } satisfies AuthRegisterDto;
  }

  /**
   * Validates the supplied API key and returns the same profile contract as
   * GET /auth/me. Throws 401 when the key is missing, unknown, inactive,
   * expired, or owned by an inactive user.
   */
  async login(dto: LoginRequestDto): Promise<AuthProfileDto> {
    const key = typeof dto.apiKey === 'string' ? dto.apiKey.trim() : '';
    if (!key) {
      throw new BadRequestException('API key is required');
    }

    const result = await this.apiKeys.findActiveByKey(key);
    if (result.status === 'rejected') {
      throw new UnauthorizedException('Invalid API key');
    }

    return this.profileAsync(result.value.user, result.value.apiKey);
  }

  /**
   * Payload of GET /auth/me, built from the request the ApiKeyGuard has
   * already resolved (the key secret is masked by ApiKeysService.toDto).
   */
  profile(user: User, apiKey: ApiKey): AuthProfileDto {
    return {
      user: this.toProfileSync(user),
      apiKey: this.apiKeys.toDto(apiKey),
    } satisfies AuthProfileDto;
  }

  /**
   * Payload of GET /auth/me, built from the request the ApiKeyGuard has
   * already resolved. Enriches with Telegram bot name when target is set.
   */
  async profileAsync(user: User, apiKey: ApiKey): Promise<AuthProfileDto> {
    return {
      user: await this.toProfile(user),
      apiKey: this.apiKeys.toDto(apiKey),
    } satisfies AuthProfileDto;
  }

  /**
   * Self-service profile update for the owner of the presented API key.
   * Supports the optional IANA time zone and the active language: a non-empty
   * string is validated and stored, null clears the time zone, an absent field
   * leaves the stored value as is. Both fields are written in one update.
   */
  async updateProfile(
    user: User,
    apiKey: ApiKey,
    dto: UpdateProfileRequestDto,
  ): Promise<AuthProfileDto> {
    const timezone =
      dto.timezone === undefined
        ? user.timezone
        : dto.timezone === null
          ? null
          : this.normalizeTimezone(dto.timezone);

    const language = this.resolveLanguage(dto.language, user.language);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { timezone, language },
    });

    return this.profileAsync(updated, apiKey);
  }

  /**
   * Active language of the profile update: an absent or null selector keeps the
   * stored language, anything outside the supported codes is a 400 listing the
   * allowed ones.
   */
  private resolveLanguage(
    raw: string | null | undefined,
    fallback: Language,
  ): Language {
    if (raw === undefined || raw === null) {
      return fallback;
    }
    const language = normalizeLanguage(raw);
    if (!language) {
      throw new BadRequestException(
        `Unsupported language: expected one of ${SUPPORTED_LANGUAGES.join(', ')}`,
      );
    }
    return language;
  }

  private toProfileSync(user: User): AuthProfileUserDto {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      timezone: user.timezone,
      language: user.language,
      telegramBotId: user.telegramBotId ?? null,
      telegramBotName: null,
    } satisfies AuthProfileUserDto;
  }

  private async toProfile(user: User): Promise<AuthProfileUserDto> {
    let telegramBotName: string | null = null;
    if (user.telegramBotId) {
      const bot = await this.prisma.telegramBot.findUnique({
        where: { id: user.telegramBotId },
        select: { name: true },
      });
      telegramBotName = bot?.name ?? null;
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      timezone: user.timezone,
      language: user.language,
      telegramBotId: user.telegramBotId ?? null,
      telegramBotName,
    } satisfies AuthProfileUserDto;
  }

  private normalizeTimezone(value: string): string {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) {
      throw new BadRequestException(
        'timezone must be a non-empty IANA time zone or null',
      );
    }
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    } catch {
      throw new BadRequestException(
        `timezone must be a valid IANA time zone, received "${trimmed}"`,
      );
    }
    return trimmed;
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
