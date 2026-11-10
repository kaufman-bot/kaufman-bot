import { ApiExtraModels, ApiProperty } from '@nestjs/swagger';

/**
 * Response shape for Telegram-bot CRUD endpoints. `botToken` is ALWAYS
 * returned masked (the secret is never sent back in full), and the
 * per-bot `webhookSecret` is intentionally absent — it only travels to
 * Telegram via `setWebhook`, never to API clients.
 */
export class TelegramBotDto {
  @ApiProperty({ description: 'Unique bot identifier' })
  id: string;

  @ApiProperty({ description: 'Human-readable bot name' })
  name: string;

  @ApiProperty({
    description: 'Masked Bot API token (the full secret is never returned)',
    example: '123456…cdef',
  })
  botToken: string;

  @ApiProperty({
    description: 'Telegram username used to build the deep-link, or null',
    nullable: true,
    type: String,
  })
  botUsername: string | null;

  @ApiProperty({
    description: 'Whether the bot is active (gates the transport bridge)',
  })
  isActive: boolean;

  @ApiProperty({
    description:
      'Arbitrary per-bot settings object (opaque to the server today), or ' +
      'null when none were stored.',
    nullable: true,
    additionalProperties: true,
  })
  settings: Record<string, unknown> | null;

  @ApiProperty({
    description: 'ADMIN user who owns this bot',
  })
  ownerId: string;

  @ApiProperty({ description: 'When the bot was created', format: 'date-time' })
  createdAt: string;

  @ApiProperty({
    description: 'When the bot was last modified',
    format: 'date-time',
  })
  updatedAt: string;

  constructor(partial: Partial<TelegramBotDto> = {}) {
    Object.assign(this, partial);
  }
}

/**
 * Request body for POST /telegram/bots. `botToken` is a write-only secret:
 * it is persisted verbatim but only ever read back masked.
 */
@ApiExtraModels()
export class CreateTelegramBotRequestDto {
  @ApiProperty({
    description: 'Display name of the bot',
    maxLength: 128,
    example: 'Support bot',
  })
  name: string;

  @ApiProperty({
    description: 'Bot API token issued by @BotFather (secret, write-only)',
    maxLength: 256,
    example: '123456789:AAHabcdefghijklmnopqrstuvwx',
  })
  botToken: string;

  @ApiProperty({
    description:
      'Telegram username (without leading @) used for the launch deep-link',
    required: false,
    maxLength: 64,
    example: 'my_support_bot',
  })
  botUsername?: string;

  @ApiProperty({
    description: 'Optional arbitrary settings object stored as-is',
    required: false,
    nullable: true,
    additionalProperties: true,
  })
  settings?: Record<string, unknown> | null;

  @ApiProperty({
    description: 'Create the bot active (default) or disabled',
    required: false,
    default: true,
  })
  isActive?: boolean;
}

/**
 * Request body for PATCH /telegram/bots/:id. Every field is optional; a
 * field that is omitted is left unchanged. `botToken` updates the stored
 * secret; `settings: null` clears the stored settings object.
 */
export class UpdateTelegramBotRequestDto {
  @ApiProperty({ required: false, maxLength: 128 })
  name?: string;

  @ApiProperty({
    required: false,
    maxLength: 256,
    description: 'New Bot API token (write-only secret)',
  })
  botToken?: string;

  @ApiProperty({ required: false, maxLength: 64, nullable: true, type: String })
  botUsername?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    additionalProperties: true,
  })
  settings?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  isActive?: boolean;
}
