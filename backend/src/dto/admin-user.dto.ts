import { ApiProperty } from '@nestjs/swagger';
import { ApiKeyDto } from './api-key.dto.js';

/** User account as seen by administrators (keys are masked). */
export class AdminUserDto {
  @ApiProperty({ description: 'User id', example: 'ckx0...cuid' })
  id: string;

  @ApiProperty({ description: 'E-mail', example: 'user@example.com' })
  email: string;

  @ApiProperty({ enum: ['USER', 'ADMIN', 'GUEST'] })
  role: string;

  @ApiProperty({ description: 'Whether the user account is active' })
  isActive: boolean;

  @ApiProperty({
    description: 'Account creation time (ISO-8601)',
    example: '2026-09-30T12:00:00.000Z',
    type: String,
  })
  createdAt: string;

  @ApiProperty({
    type: [ApiKeyDto],
    description: 'Keys issued for the account',
  })
  apiKeys: ApiKeyDto[];
}

/** Collection of user accounts. */
export class AdminUserListDto {
  @ApiProperty({ type: [AdminUserDto] })
  items: AdminUserDto[];

  @ApiProperty({ description: 'Number of users in the list', example: 3 })
  total: number;
}

/** Request body of PATCH /admin/users/:id. */
export class UpdateAdminUserRequestDto {
  @ApiProperty({
    required: false,
    description:
      'Activate or deactivate the account (deactivation rejects all its keys)',
  })
  isActive?: boolean;

  @ApiProperty({
    required: false,
    enum: ['USER', 'ADMIN', 'GUEST'],
    description: 'New role of the account',
  })
  role?: 'USER' | 'ADMIN' | 'GUEST';
}
