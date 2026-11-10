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
import {
  ButtonPresetDto,
  CreateButtonPresetRequestDto,
  UpdateButtonPresetRequestDto,
} from '../dto/button-presets.dto.js';
import { ApiErrorDto } from '../dto/error.dto.js';
import { AdminGuard } from '../guards/admin.guard.js';
import type { AuthenticatedRequest } from '../guards/api-key.guard.js';
import { ApiKeyGuard, requireAuthUser } from '../guards/api-key.guard.js';
import { ButtonPresetsService } from '../services/button-presets.service.js';

/**
 * REST surface over button presets. Mounted under `mock-bot/presets` so
 * the console sees a single namespaced resource next to `mock-bot/*`.
 * Both guards are required: `ApiKeyGuard` resolves the caller, `AdminGuard`
 * rejects non-ADMIN keys with 403. Ownership is enforced inside
 * `ButtonPresetsService` (see specs/button-presets "Список пресетов
 * оператора" and "Изменение пресета") — a caller can never read, edit or
 * delete another admin's preset.
 */
@ApiTags('Mock Bot Presets')
@Controller('mock-bot/presets')
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
export class ButtonPresetsController {
  constructor(private readonly presets: ButtonPresetsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a named preset of inline keyboard buttons',
  })
  @ApiCreatedResponse({
    type: ButtonPresetDto,
    description: 'The persisted preset owned by the calling admin',
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description:
      'Empty name, empty buttons list, or buttons that fail validation ' +
      '(missing/blank title/callbackData, per-field length limits, >12 items)',
  })
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateButtonPresetRequestDto,
  ): Promise<ButtonPresetDto> {
    const owner = requireAuthUser(req);
    return this.presets.create(owner.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List presets owned by the calling admin',
  })
  @ApiOkResponse({
    type: ButtonPresetDto,
    isArray: true,
    description:
      'Only the caller-owned presets; foreign presets are never returned',
  })
  async list(@Req() req: AuthenticatedRequest): Promise<ButtonPresetDto[]> {
    const owner = requireAuthUser(req);
    return this.presets.listForOwner(owner.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update the name and/or buttons of a caller-owned preset',
  })
  @ApiParam({ name: 'id', description: 'Preset id' })
  @ApiOkResponse({
    type: ButtonPresetDto,
    description: 'The updated preset',
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Empty body, invalid name or invalid buttons',
  })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: 'Preset does not exist or belongs to another admin',
  })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateButtonPresetRequestDto,
  ): Promise<ButtonPresetDto> {
    const owner = requireAuthUser(req);
    return this.presets.update(owner.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Delete a caller-owned preset (already-sent messages keep buttons)',
  })
  @ApiParam({ name: 'id', description: 'Preset id' })
  @ApiNoContentResponse({ description: 'Preset deleted' })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: 'Preset does not exist or belongs to another admin',
  })
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    const owner = requireAuthUser(req);
    await this.presets.remove(owner.id, id);
  }
}
