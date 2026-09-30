import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { X_API_KEY } from '../constants/api-key.constants.js';
import {
  AuthProfileDto,
  AuthRegisterDto,
  RegisterRequestDto,
} from '../dto/auth.dto.js';
import { ApiErrorDto } from '../dto/error.dto.js';
import type { AuthenticatedRequest } from '../guards/api-key.guard.js';
import {
  ApiKeyGuard,
  requireAuthApiKey,
  requireAuthUser,
} from '../guards/api-key.guard.js';
import { AuthService } from '../services/auth.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Create a USER account and issue its first API key',
  })
  @ApiCreatedResponse({
    type: AuthRegisterDto,
    description: 'Account plus its new key; the secret is revealed only here',
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'E-mail is malformed or password is shorter than 8 characters',
  })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'An account with this e-mail already exists',
  })
  register(@Body() dto: RegisterRequestDto): Promise<AuthRegisterDto> {
    return this.auth.register(dto);
  }

  @Get('me')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Get the profile behind the presented API key' })
  @ApiHeader({
    name: X_API_KEY,
    description:
      'API key. Optional in the schema because ?apiKey= is accepted as an ' +
      'alternative (header-less SSE clients); the guard rejects requests that ' +
      'carry neither.',
    required: false,
  })
  @ApiQuery({
    name: 'apiKey',
    type: String,
    required: false,
    description:
      'API key alternative for clients that cannot set headers (EventSource). ' +
      'Ignored when the x-api-key header is present.',
  })
  @ApiOkResponse({ type: AuthProfileDto })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid API key',
    type: ApiErrorDto,
  })
  me(@Req() req: AuthenticatedRequest): AuthProfileDto {
    return this.auth.profile(requireAuthUser(req), requireAuthApiKey(req));
  }
}
