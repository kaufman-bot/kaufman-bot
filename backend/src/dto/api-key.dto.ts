import { ApiProperty } from '@nestjs/swagger';

/**
 * API key with the secret revealed — returned only by POST /api-keys and by
 * registration, every other endpoint masks the value.
 */
export class ApiKeySecretDto {
  @ApiProperty({ description: 'API key id', example: 'ckx0...cuid' })
  id: string;

  @ApiProperty({
    description: 'Full key value, revealed only here — later reads are masked',
    example: 'sk-3f9c1e2a4b5c6d7e8f90123456789abcdef012345',
  })
  key: string;

  @ApiProperty({ description: 'Key name', example: 'CI pipeline' })
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

/** API key as seen by the owner after creation (secret masked). */
export class ApiKeyDto {
  @ApiProperty({ description: 'API key id', example: 'ckx0...cuid' })
  id: string;

  @ApiProperty({
    description: 'Masked key value (first 8 characters + ellipsis)',
    example: 'sk-3f9c1…',
  })
  key: string;

  @ApiProperty({ description: 'Key name', example: 'CI pipeline' })
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

/** Collection of the API keys of one user. */
export class ApiKeyListDto {
  @ApiProperty({ type: [ApiKeyDto] })
  items: ApiKeyDto[];

  @ApiProperty({ description: 'Number of keys in the list', example: 2 })
  total: number;
}

/** Request body of POST /api-keys. */
export class CreateApiKeyRequestDto {
  @ApiProperty({
    description: 'Human readable key name',
    example: 'CI pipeline',
    minLength: 1,
  })
  name: string;

  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    description:
      'Expiration as an ISO-8601 string (the one time format of this API). ' +
      'A moment in the past is accepted and makes the key immediately unusable.',
    example: '2026-12-31T23:59:59.000Z',
  })
  expiresAt?: string | null;

  @ApiProperty({
    required: false,
    description: 'Create the key in a disabled state (default: enabled)',
  })
  isActive?: boolean;
}

/** Request body of PATCH /api-keys/:id. */
export class UpdateApiKeyRequestDto {
  @ApiProperty({
    required: false,
    description: 'New key name',
    example: 'CI pipeline (rotated)',
  })
  name?: string;

  @ApiProperty({ required: false, description: 'Enable or disable the key' })
  isActive?: boolean;

  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    description: 'New expiration (ISO-8601) or null to make the key eternal',
    example: '2026-12-31T23:59:59.000Z',
  })
  expiresAt?: string | null;
}
