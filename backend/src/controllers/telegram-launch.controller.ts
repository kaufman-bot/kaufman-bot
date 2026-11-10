import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { X_API_KEY } from '../constants/api-key.constants.js';
import { ApiErrorDto } from '../dto/error.dto.js';
import { TelegramLaunchDto } from '../dto/telegram-launch.dto.js';
import type { AuthenticatedRequest } from '../guards/api-key.guard.js';
import { ApiKeyGuard, requireAuthUser } from '../guards/api-key.guard.js';
import { TelegramBindingService } from '../services/telegram-binding.service.js';

/**
 * Allows a user to obtain a Telegram deep-link to start (or re-authorize)
 * their bot session. Requires only `ApiKeyGuard` (no ADMIN role) — any
 * authenticated user whose active target is a bot can invoke this.
 */
@ApiTags('Telegram Launch')
@Controller('telegram')
@UseGuards(ApiKeyGuard)
@ApiHeader({
  name: X_API_KEY,
  required: false,
  description: 'API key of an authenticated user account.',
})
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'No valid API key provided',
})
export class TelegramLaunchController {
  constructor(private readonly binding: TelegramBindingService) {}

  @Post('launch')
  @ApiOperation({
    summary: 'Get a t.me deep-link to start the Telegram bot conversation',
  })
  @ApiOkResponse({
    type: TelegramLaunchDto,
    description: 'Deep-link URL and one-time binding token',
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'User target is mock-server or bot username not set',
  })
  async launch(@Req() req: AuthenticatedRequest): Promise<TelegramLaunchDto> {
    const user = requireAuthUser(req);
    return this.binding.launch(user.id);
  }
}
