import { ApiProperty } from '@nestjs/swagger';

/**
 * Body of non-2xx responses produced by Nest exception filters and by
 * ApiKeyGuard / validation in services.
 */
export class ApiErrorDto {
  @ApiProperty({
    description: 'Human readable reason of the rejection',
    example: 'Invalid API key',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message: string | string[];

  @ApiProperty({ description: 'HTTP error name', example: 'Unauthorized' })
  error: string;

  @ApiProperty({ description: 'HTTP status code', example: 401 })
  statusCode: number;
}
