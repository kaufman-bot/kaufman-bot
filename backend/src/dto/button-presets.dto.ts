import { ApiExtraModels, ApiProperty } from '@nestjs/swagger';
import { KeyboardButtonDto } from './keyboard.dto.js';

/**
 * Request body for POST /mock-bot/presets. Creates a named reusable set
 * of inline keyboard buttons owned by the calling ADMIN. The `buttons`
 * array is validated in the service (non-empty, 1..12 items, per-field
 * length limits); Swagger `required: true` here only describes the JSON
 * shape for SDK clients.
 */
@ApiExtraModels(KeyboardButtonDto)
export class CreateButtonPresetRequestDto {
  @ApiProperty({
    description: 'Preset name shown in the console list',
    maxLength: 128,
    example: 'Confirm / Decline',
  })
  name: string;

  @ApiProperty({
    description:
      'Ordered set of buttons (1..12 items). Each button must have a ' +
      'non-empty title (≤64 chars) and callbackData (≤256 chars).',
    type: KeyboardButtonDto,
    isArray: true,
  })
  buttons: KeyboardButtonDto[];
}

/**
 * Request body for PATCH /mock-bot/presets/:id. At least one of `name` or
 * `buttons` MUST be provided; the service rejects an empty body with 400.
 * Fields that are omitted are left unchanged on the stored preset.
 */
@ApiExtraModels(KeyboardButtonDto)
export class UpdateButtonPresetRequestDto {
  @ApiProperty({
    description: 'New preset name (optional; unchanged when omitted)',
    maxLength: 128,
    required: false,
  })
  name?: string;

  @ApiProperty({
    description:
      'New ordered set of buttons (optional; unchanged when omitted). When ' +
      'provided it must contain 1..12 valid buttons.',
    type: KeyboardButtonDto,
    isArray: true,
    required: false,
  })
  buttons?: KeyboardButtonDto[];
}

/**
 * Response shape for preset CRUD endpoints. `buttons` always comes back as
 * a typed array (never null) because a preset without buttons is invalid;
 * `ownerId` is exposed so the console can grey out foreign presets if it
 * ever needs to, but the list endpoint already filters to the caller.
 */
@ApiExtraModels(KeyboardButtonDto)
export class ButtonPresetDto {
  @ApiProperty({ description: 'Unique preset identifier' })
  id: string;

  @ApiProperty({ description: 'Preset name' })
  name: string;

  @ApiProperty({
    description: 'Ordered buttons stored in the preset',
    type: KeyboardButtonDto,
    isArray: true,
  })
  buttons: KeyboardButtonDto[];

  @ApiProperty({ description: 'ADMIN user who owns this preset' })
  ownerId: string;

  @ApiProperty({
    description: 'When the preset was created',
    format: 'date-time',
  })
  createdAt: string;

  @ApiProperty({
    description: 'When the preset was last modified',
    format: 'date-time',
  })
  updatedAt: string;

  constructor(partial: Partial<ButtonPresetDto> = {}) {
    Object.assign(this, partial);
  }
}
