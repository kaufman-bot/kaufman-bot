import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ButtonPresetDto,
  CreateButtonPresetRequestDto,
  UpdateButtonPresetRequestDto,
} from '../dto/button-presets.dto.js';
import { KeyboardButtonDto } from '../dto/keyboard.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  normalizeButtons,
  toButtons,
  validateButtons,
} from '../utils/keyboard-buttons.js';

/** Maximum length of a preset name shown in the console list. */
const MAX_PRESET_NAME_LENGTH = 128;

/** Row shape returned by Prisma for the `button_presets` table. */
type ButtonPresetRow = {
  id: string;
  name: string;
  buttons: unknown;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * CRUD-only service over the `ButtonPreset` table. Presets are the
 * operator-side reusable button sets and always belong to the ADMIN who
 * created them; every query filters by `ownerId`, so one admin can never
 * list, edit or delete another admin's presets (isolation is enforced at
 * the query level, not just at the HTTP guard). The "active" preset is a
 * pure console concept — this service never persists or resolves it.
 *
 * Splitting this out of `MockBotService` mirrors the project convention
 * of separating entity CRUD from use-case orchestration (`UsersService`
 * next to `AuthService`, `ApiKeysService` next to the guard).
 */
@Injectable()
export class ButtonPresetsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new preset owned by `ownerId`. Validates the preset name
   * (non-empty after trim, ≤128 chars) and runs the shared buttons
   * validator (1..12 items, per-field length limits). Persisted `buttons`
   * keep the caller's order and use the canonical `{ title, callbackData }`
   * shape only.
   */
  async create(
    ownerId: string,
    dto: CreateButtonPresetRequestDto,
  ): Promise<ButtonPresetDto> {
    const name = this.normalizeName(dto.name);
    validateButtons(dto.buttons);
    const normalized = normalizeButtons(dto.buttons);
    if (!normalized || normalized.length === 0) {
      throw new BadRequestException('Preset requires at least one button');
    }

    const row = await this.prisma.buttonPreset.create({
      data: {
        name,
        ownerId,
        buttons: normalized as unknown as KeyboardButtonDto[] extends never
          ? never
          : object,
      },
    });

    return this.toDto(row);
  }

  /** Lists every preset whose `ownerId` equals the caller's user id. */
  async listForOwner(ownerId: string): Promise<ButtonPresetDto[]> {
    const rows = await this.prisma.buttonPreset.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  /**
   * Updates name and/or buttons of the caller-owned preset with `id`.
   * An update that supplies neither is a 400 (nothing to change); when
   * `buttons` is provided it must contain 1..12 valid buttons. Ownership
   * is enforced through a conditional `updateMany({ id, ownerId })`, so a
   * missing OR foreign preset both surface as 404 without leaking which
   * case it was.
   */
  async update(
    ownerId: string,
    id: string,
    dto: UpdateButtonPresetRequestDto,
  ): Promise<ButtonPresetDto> {
    const data: { name?: string; buttons?: object } = {};

    if (dto.name !== undefined) {
      data.name = this.normalizeName(dto.name);
    }
    if (dto.buttons !== undefined) {
      validateButtons(dto.buttons);
      const normalized = normalizeButtons(dto.buttons);
      if (!normalized || normalized.length === 0) {
        throw new BadRequestException('Preset requires at least one button');
      }
      data.buttons = normalized as unknown as object;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Update requires name and/or buttons to be provided',
      );
    }

    const updated = await this.prisma.buttonPreset.updateMany({
      where: { id, ownerId },
      data,
    });
    if (updated.count === 0) {
      throw new NotFoundException('Preset not found');
    }

    const row = await this.prisma.buttonPreset.findFirst({
      where: { id, ownerId },
    });
    if (!row) {
      // Defensive: updateMany just matched one row, so this should not
      // happen unless the row is deleted concurrently. Keep the same 404.
      throw new NotFoundException('Preset not found');
    }
    return this.toDto(row);
  }

  /**
   * Removes the caller-owned preset with `id`. Conditional `deleteMany`
   * means a missing OR foreign id both yield 404 and neither deletes any
   * row. Already-sent bot messages are unaffected — `Message.buttons` is
   * an independent snapshot.
   */
  async remove(ownerId: string, id: string): Promise<void> {
    const deleted = await this.prisma.buttonPreset.deleteMany({
      where: { id, ownerId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('Preset not found');
    }
  }

  private normalizeName(raw: string | undefined): string {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (!trimmed) {
      throw new BadRequestException('Preset name cannot be empty');
    }
    if (trimmed.length > MAX_PRESET_NAME_LENGTH) {
      throw new BadRequestException(
        `Preset name exceeds ${MAX_PRESET_NAME_LENGTH} characters`,
      );
    }
    return trimmed;
  }

  private toDto(row: ButtonPresetRow): ButtonPresetDto {
    const buttons = toButtons(row.buttons) ?? [];
    return new ButtonPresetDto({
      id: row.id,
      name: row.name,
      buttons,
      ownerId: row.ownerId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
}
