import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateTelegramBotRequestDto,
  TelegramBotDto,
  UpdateTelegramBotRequestDto,
} from '../dto/telegram-bots.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Maximum length of a bot display name. */
const MAX_NAME_LENGTH = 128;
/** Maximum length of a Bot API token. */
const MAX_TOKEN_LENGTH = 256;
/** Maximum length of a Telegram username. */
const MAX_USERNAME_LENGTH = 64;

/** Row shape Prisma returns for `telegram_bots`. */
type TelegramBotRow = {
  id: string;
  ownerId: string;
  name: string;
  botToken: string;
  botUsername: string | null;
  isActive: boolean;
  settings: unknown;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Entity-CRUD over the `TelegramBot` table, scoped to the owning ADMIN
 * exactly like `ButtonPresetsService`: every read/update/delete filters by
 * `ownerId`, so a missing bot and a foreign bot are indistinguishable (both
 * 404). The raw `botToken` is stored verbatim but every DTO masks it; the
 * per-bot `webhookSecret` is never surfaced. Webhook registration is NOT
 * this service's concern (see `TelegramWebhookService` / the controller).
 */
@Injectable()
export class TelegramBotsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a bot owned by `ownerId`; returns it with a masked token. */
  async create(
    ownerId: string,
    dto: CreateTelegramBotRequestDto,
  ): Promise<TelegramBotDto> {
    const name = this.normalizeName(dto.name);
    const botToken = this.normalizeToken(dto.botToken);
    const botUsername = this.normalizeUsername(dto.botUsername);

    const row = await this.prisma.telegramBot.create({
      data: {
        ownerId,
        name,
        botToken,
        ...(botUsername !== undefined ? { botUsername } : {}),
        ...(dto.settings !== undefined
          ? { settings: this.toSettingsInput(dto.settings) }
          : {}),
        isActive: dto.isActive === false ? false : true,
      },
    });

    return this.toDto(row);
  }

  /** Lists the caller's bots (masked tokens), most recently changed first. */
  async listForOwner(ownerId: string): Promise<TelegramBotDto[]> {
    const rows = await this.prisma.telegramBot.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  /** Reads a caller-owned bot; 404 on a missing OR foreign id. */
  async get(ownerId: string, id: string): Promise<TelegramBotDto> {
    const row = await this.prisma.telegramBot.findFirst({
      where: { id, ownerId },
    });
    if (!row) {
      throw new NotFoundException('Telegram bot not found');
    }
    return this.toDto(row);
  }

  /**
   * Updates the caller-owned bot. Every field is optional; an empty body is a
   * 400, a missing OR foreign bot is a 404 (conditional `updateMany`, so the
   * two are not distinguishable). Returns the updated bot with a masked token.
   */
  async update(
    ownerId: string,
    id: string,
    dto: UpdateTelegramBotRequestDto,
  ): Promise<TelegramBotDto> {
    const data: {
      name?: string;
      botToken?: string;
      botUsername?: string | null;
      settings?: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;
      isActive?: boolean;
    } = {};

    if (dto.name !== undefined) {
      data.name = this.normalizeName(dto.name);
    }
    if (dto.botToken !== undefined) {
      data.botToken = this.normalizeToken(dto.botToken);
    }
    if (dto.botUsername !== undefined) {
      data.botUsername =
        dto.botUsername === null
          ? null
          : this.normalizeUsername(dto.botUsername);
    }
    if (dto.settings !== undefined) {
      data.settings = this.toSettingsInput(dto.settings);
    }
    if (dto.isActive !== undefined) {
      if (typeof dto.isActive !== 'boolean') {
        throw new BadRequestException('isActive must be a boolean');
      }
      data.isActive = dto.isActive;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Update requires at least one of name, botToken, botUsername, settings, isActive',
      );
    }

    const updated = await this.prisma.telegramBot.updateMany({
      where: { id, ownerId },
      data,
    });
    if (updated.count === 0) {
      throw new NotFoundException('Telegram bot not found');
    }

    const row = await this.prisma.telegramBot.findFirst({
      where: { id, ownerId },
    });
    if (!row) {
      throw new NotFoundException('Telegram bot not found');
    }
    return this.toDto(row);
  }

  /**
   * Deletes a caller-owned bot and returns its raw token so the caller can
   * best-effort unregister its webhook (the row is gone by then, so this is
   * the last chance to read the secret). 404 on a missing OR foreign id.
   */
  async remove(ownerId: string, id: string): Promise<{ botToken: string }> {
    const row = await this.prisma.telegramBot.findFirst({
      where: { id, ownerId },
      select: { botToken: true },
    });
    if (!row) {
      throw new NotFoundException('Telegram bot not found');
    }
    await this.prisma.telegramBot.delete({ where: { id } });
    return { botToken: row.botToken };
  }

  /** Resolves the caller-owned bot's raw fields for webhook registration. */
  async findOwnedRaw(
    ownerId: string,
    id: string,
  ): Promise<{
    botToken: string;
    webhookSecret: string;
    isActive: boolean;
  } | null> {
    return this.prisma.telegramBot.findFirst({
      where: { id, ownerId },
      select: { botToken: true, webhookSecret: true, isActive: true },
    });
  }

  private normalizeName(raw: string | undefined): string {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (!trimmed) {
      throw new BadRequestException('Bot name cannot be empty');
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      throw new BadRequestException(
        `Bot name exceeds ${MAX_NAME_LENGTH} characters`,
      );
    }
    return trimmed;
  }

  private normalizeToken(raw: string | undefined): string {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (!trimmed) {
      throw new BadRequestException('Bot token cannot be empty');
    }
    if (trimmed.length > MAX_TOKEN_LENGTH) {
      throw new BadRequestException(
        `Bot token exceeds ${MAX_TOKEN_LENGTH} characters`,
      );
    }
    return trimmed;
  }

  private normalizeUsername(
    raw: string | undefined | null,
  ): string | undefined {
    if (raw === undefined || raw === null) {
      return undefined;
    }
    const trimmed = raw.trim().replace(/^@/, '');
    if (!trimmed) {
      return undefined;
    }
    if (trimmed.length > MAX_USERNAME_LENGTH) {
      throw new BadRequestException(
        `Bot username exceeds ${MAX_USERNAME_LENGTH} characters`,
      );
    }
    return trimmed;
  }

  private toSettingsInput(
    value: Record<string, unknown> | null | undefined,
  ): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
    if (value === null) {
      return Prisma.DbNull;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('settings must be a JSON object or null');
    }
    return value as unknown as Prisma.InputJsonValue;
  }

  private maskToken(token: string): string {
    if (token.length <= 10) {
      return '…';
    }
    return `${token.slice(0, 6)}…${token.slice(-4)}`;
  }

  private toDto(row: TelegramBotRow): TelegramBotDto {
    return new TelegramBotDto({
      id: row.id,
      name: row.name,
      botToken: this.maskToken(row.botToken),
      botUsername: row.botUsername,
      isActive: row.isActive,
      settings:
        row.settings && typeof row.settings === 'object'
          ? (row.settings as Record<string, unknown>)
          : null,
      ownerId: row.ownerId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
}
