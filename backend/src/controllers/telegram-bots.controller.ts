import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { X_API_KEY } from '../constants/api-key.constants.js';
import { ApiErrorDto } from '../dto/error.dto.js';
import {
  CreateTelegramBotRequestDto,
  TelegramBotDto,
  UpdateTelegramBotRequestDto,
} from '../dto/telegram-bots.dto.js';
import { AdminGuard } from '../guards/admin.guard.js';
import type { AuthenticatedRequest } from '../guards/api-key.guard.js';
import { ApiKeyGuard, requireAuthUser } from '../guards/api-key.guard.js';
import { TelegramBotsService } from '../services/telegram-bots.service.js';
import { TelegramWebhookService } from '../services/telegram-webhook.service.js';

/**
 * REST surface for Telegram-bot CRUD. Mounted under `telegram/bots` so
 * the path is namespaced within the Telegram domain. Both guards are
 * required: `ApiKeyGuard` resolves the caller, `AdminGuard` rejects
 * non-ADMIN keys with 403. Ownership is enforced inside the service —
 * a caller can never read, edit, or delete another admin's bot.
 *
 * Webhook registration/unregistration is fire-and-forget orchestrated here
 * (best-effort; a Telegram network error never breaks the HTTP response).
 */
@ApiTags('Telegram Bots')
@Controller('telegram/bots')
@UseGuards(ApiKeyGuard, AdminGuard)
@ApiHeader({
  name: X_API_KEY,
  required: false,
  description:
    'API key of an ADMIN account. Optional in the schema because ?apiKey= ' +
    'is accepted as an alternative; the guard rejects requests that carry neither.',
})
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'No valid API key provided',
})
@ApiForbiddenResponse({
  type: ApiErrorDto,
  description: 'Authenticated account is not an admin',
})
export class TelegramBotsController {
  constructor(
    private readonly bots: TelegramBotsService,
    private readonly webhook: TelegramWebhookService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a Telegram bot owned by the calling admin' })
  @ApiCreatedResponse({
    type: TelegramBotDto,
    description: 'The persisted bot with masked token',
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Empty name, empty token, or token exceeds length limits',
  })
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateTelegramBotRequestDto,
  ): Promise<TelegramBotDto> {
    const owner = requireAuthUser(req);
    const result = await this.bots.create(owner.id, dto);
    // Fire-and-forget webhook registration for the newly created bot.
    void this.webhook.syncById(result.id);
    return result;
  }

  @Get()
  @ApiOperation({ summary: 'List Telegram bots owned by the calling admin' })
  @ApiOkResponse({
    type: TelegramBotDto,
    isArray: true,
    description: 'Only the caller-owned bots; foreign bots are never returned',
  })
  async list(@Req() req: AuthenticatedRequest): Promise<TelegramBotDto[]> {
    const owner = requireAuthUser(req);
    return this.bots.listForOwner(owner.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read a single caller-owned Telegram bot' })
  @ApiParam({ name: 'id', description: 'Bot id' })
  @ApiOkResponse({ type: TelegramBotDto, description: 'The bot' })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: 'Bot does not exist or belongs to another admin',
  })
  async get(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<TelegramBotDto> {
    const owner = requireAuthUser(req);
    return this.bots.get(owner.id, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update the name, token, settings, or isActive of a caller-owned bot',
  })
  @ApiParam({ name: 'id', description: 'Bot id' })
  @ApiOkResponse({ type: TelegramBotDto, description: 'The updated bot' })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Empty body or invalid field values',
  })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: 'Bot does not exist or belongs to another admin',
  })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateTelegramBotRequestDto,
  ): Promise<TelegramBotDto> {
    const owner = requireAuthUser(req);
    const result = await this.bots.update(owner.id, id, dto);
    // Fire-and-forget webhook sync (set or delete depending on isActive).
    void this.webhook.syncById(id);
    return result;
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a caller-owned Telegram bot' })
  @ApiParam({ name: 'id', description: 'Bot id' })
  @ApiNoContentResponse({ description: 'Bot deleted' })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: 'Bot does not exist or belongs to another admin',
  })
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    const owner = requireAuthUser(req);
    const { botToken } = await this.bots.remove(owner.id, id);
    // Fire-and-forget webhook removal after bot deletion.
    void this.webhook.unregisterByToken(botToken);
  }
}
