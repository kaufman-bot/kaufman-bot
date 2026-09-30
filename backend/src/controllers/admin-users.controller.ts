import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
  AdminUserDto,
  AdminUserListDto,
  UpdateAdminUserRequestDto,
} from '../dto/admin-user.dto.js';
import { ApiErrorDto } from '../dto/error.dto.js';
import { AdminGuard } from '../guards/admin.guard.js';
import type { AuthenticatedRequest } from '../guards/api-key.guard.js';
import { ApiKeyGuard, requireAuthUser } from '../guards/api-key.guard.js';
import { UsersService } from '../services/users.service.js';

/**
 * Administrative access to user accounts. Both guards are required:
 * ApiKeyGuard resolves the caller, AdminGuard checks the ADMIN role.
 */
@ApiTags('admin')
@Controller('admin/users')
@UseGuards(ApiKeyGuard, AdminGuard)
@ApiHeader({
  name: X_API_KEY,
  required: false,
  description: 'API key of an ADMIN account (?apiKey= also works).',
})
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'No valid API key' })
@ApiForbiddenResponse({
  type: ApiErrorDto,
  description: 'Authenticated account is not an admin',
})
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List all user accounts with their masked keys' })
  @ApiOkResponse({ type: AdminUserListDto })
  list(): Promise<AdminUserListDto> {
    return this.users.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read a single user account' })
  @ApiParam({ name: 'id', description: 'User id' })
  @ApiOkResponse({ type: AdminUserDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'User not found' })
  get(@Param('id') id: string): Promise<AdminUserDto> {
    return this.users.get(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Activate/deactivate an account or change its role',
  })
  @ApiParam({ name: 'id', description: 'User id' })
  @ApiOkResponse({ type: AdminUserDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Invalid isActive or role value',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'User not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserRequestDto,
  ): Promise<AdminUserDto> {
    return this.users.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an account (its API keys cascade)' })
  @ApiParam({ name: 'id', description: 'User id' })
  @ApiForbiddenResponse({
    type: ApiErrorDto,
    description: 'Trying to delete the account of the caller itself',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'User not found' })
  @ApiNoContentResponse({ description: 'Account deleted' })
  @HttpCode(204)
  async remove(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.users.remove(id, requireAuthUser(req).id);
  }
}
