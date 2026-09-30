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
  ApiKeyDto,
  ApiKeyListDto,
  ApiKeySecretDto,
  CreateApiKeyRequestDto,
  UpdateApiKeyRequestDto,
} from '../dto/api-key.dto.js';
import { ApiErrorDto } from '../dto/error.dto.js';
import type { AuthenticatedRequest } from '../guards/api-key.guard.js';
import { ApiKeyGuard, requireAuthUser } from '../guards/api-key.guard.js';
import { ApiKeysService } from '../services/api-keys.service.js';

/**
 * CRUD of the API keys owned by the authenticated user. The key of the caller
 * authorizes the request and also defines which account the keys belong to.
 */
@ApiTags('api-keys')
@Controller('api-keys')
@UseGuards(ApiKeyGuard)
@ApiHeader({
  name: X_API_KEY,
  required: false,
  description:
    'API key of the account whose keys are managed. Optional in the schema ' +
    'because ?apiKey= is accepted as an alternative; the guard rejects ' +
    'requests that carry neither.',
})
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'No valid API key' })
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List the API keys of the authenticated user' })
  @ApiOkResponse({ type: ApiKeyListDto })
  async list(@Req() req: AuthenticatedRequest): Promise<ApiKeyListDto> {
    return this.apiKeys.listForUser(requireAuthUser(req).id);
  }

  @Post()
  @ApiOperation({ summary: 'Issue a new API key for the authenticated user' })
  @ApiCreatedResponse({
    type: ApiKeySecretDto,
    description: 'Created key; the secret is revealed only in this response',
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Empty name or expiresAt is not an ISO-8601 string',
  })
  @HttpCode(201)
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateApiKeyRequestDto,
  ): Promise<ApiKeySecretDto> {
    return this.apiKeys.createForUser(requireAuthUser(req).id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename, (de)activate or re-expire an API key' })
  @ApiParam({ name: 'id', description: 'API key id' })
  @ApiOkResponse({ type: ApiKeyDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Invalid name, isActive or expiresAt value',
  })
  @ApiForbiddenResponse({
    type: ApiErrorDto,
    description: 'The key belongs to another user',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'API key not found' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateApiKeyRequestDto,
  ): Promise<ApiKeyDto> {
    return this.apiKeys.updateForUser(requireAuthUser(req).id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke and delete an API key' })
  @ApiParam({ name: 'id', description: 'API key id' })
  @ApiForbiddenResponse({
    type: ApiErrorDto,
    description: 'The key belongs to another user',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'API key not found' })
  @ApiNoContentResponse({ description: 'Key deleted' })
  @HttpCode(204)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    await this.apiKeys.deleteForUser(requireAuthUser(req).id, id);
  }
}
