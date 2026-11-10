import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
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
  LoginRequestDto,
  RegisterRequestDto,
  UpdateProfileRequestDto,
} from '../dto/auth.dto.js';
import { ApiErrorDto } from '../dto/error.dto.js';
import type { AuthenticatedRequest } from '../guards/api-key.guard.js';
import {
  ApiKeyGuard,
  requireAuthApiKey,
  requireAuthUser,
} from '../guards/api-key.guard.js';
import { AuthService } from '../services/auth.service.js';

/** Swagger doc of the x-api-key header shared by guarded endpoints. */
const KEY_HEADER_DOC = {
  name: X_API_KEY,
  description:
    'API key. Optional in the schema because ?apiKey= is accepted as an ' +
    'alternative (header-less SSE clients); the guard rejects requests that ' +
    'carry neither.',
  required: false,
} as const;

/** Swagger doc of the ?apiKey= fallback shared by guarded endpoints. */
const KEY_QUERY_DOC = {
  name: 'apiKey',
  type: String,
  required: false,
  description:
    'API key alternative for clients that cannot set headers (EventSource). ' +
    'Ignored when the x-api-key header is present.',
} as const;

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

  @Post('login')
  @ApiOperation({
    summary: 'Validate an API key and return the profile behind it',
  })
  @ApiOkResponse({
    type: AuthProfileDto,
    description: 'Profile of the authenticated user and key metadata',
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'API key is missing from the request body',
  })
  @ApiUnauthorizedResponse({
    type: ApiErrorDto,
    description:
      'API key is unknown, inactive, expired, or its user is inactive',
  })
  login(@Body() dto: LoginRequestDto): Promise<AuthProfileDto> {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Get the profile behind the presented API key' })
  @ApiHeader(KEY_HEADER_DOC)
  @ApiQuery(KEY_QUERY_DOC)
  @ApiOkResponse({ type: AuthProfileDto })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid API key',
    type: ApiErrorDto,
  })
  async me(@Req() req: AuthenticatedRequest): Promise<AuthProfileDto> {
    return this.auth.profileAsync(requireAuthUser(req), requireAuthApiKey(req));
  }

  @Patch('me')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Update the profile behind the presented API key' })
  @ApiHeader(KEY_HEADER_DOC)
  @ApiQuery(KEY_QUERY_DOC)
  @ApiOkResponse({
    type: AuthProfileDto,
    description: 'Updated profile of the authenticated user and key metadata',
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'timezone is present but is not a valid IANA time zone',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid API key',
    type: ApiErrorDto,
  })
  updateMe(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileRequestDto,
  ): Promise<AuthProfileDto> {
    return this.auth.updateProfile(
      requireAuthUser(req),
      requireAuthApiKey(req),
      dto,
    );
  }
}
