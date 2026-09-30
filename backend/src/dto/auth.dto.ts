import { ApiProperty } from '@nestjs/swagger';
import { ApiKeySecretDto } from './api-key.dto.js';

/** User part of the auth profile response. */
export class AuthProfileUserDto {
  @ApiProperty({ description: 'User id', example: 'ckx0...cuid' })
  id: string;

  @ApiProperty({ description: 'E-mail', example: 'admin@kaufman.bot' })
  email: string;

  @ApiProperty({ enum: ['USER', 'ADMIN', 'GUEST'] })
  role: string;

  @ApiProperty({ description: 'Whether the user account is active' })
  isActive: boolean;
}

/** API-key part of the auth profile response (the secret itself is masked). */
export class AuthProfileApiKeyDto {
  @ApiProperty({ description: 'API key id', example: 'cky0...cuid' })
  id: string;

  @ApiProperty({
    description: 'Masked key value',
    example: 'abcd1234…',
  })
  key: string;

  @ApiProperty({ description: 'Key name', example: 'Default admin key' })
  name: string;

  @ApiProperty({ description: 'Whether the key is active' })
  isActive: boolean;

  @ApiProperty({
    description: 'Expiration (ISO-8601) or null when the key never expires',
    nullable: true,
    type: String,
  })
  expiresAt: string | null;
}

/** Response of GET /auth/me — the identity behind the presented API key. */
export class AuthProfileDto {
  @ApiProperty({ type: AuthProfileUserDto })
  user: AuthProfileUserDto;

  @ApiProperty({ type: AuthProfileApiKeyDto })
  apiKey: AuthProfileApiKeyDto;
}

/** Request body of POST /auth/register. */
export class RegisterRequestDto {
  @ApiProperty({
    description: 'E-mail of the new account, unique across the project',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Password, at least 8 characters (stored as a scrypt hash)',
    example: 'super-secret-123',
    minLength: 8,
  })
  password: string;
}

/**
 * Response of POST /auth/register: the created account plus its first API
 * key. The key secret is revealed only here.
 */
export class AuthRegisterDto {
  @ApiProperty({ type: AuthProfileUserDto })
  user: AuthProfileUserDto;

  @ApiProperty({ type: ApiKeySecretDto })
  apiKey: ApiKeySecretDto;
}
