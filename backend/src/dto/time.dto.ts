import { ApiProperty } from '@nestjs/swagger';

/**
 * Single time format used by the time API: ISO-8601 string.
 *
 * Returned by GET /time and used as the payload of each SSE event of
 * GET /time/stream, so both endpoints emit the exact same shape.
 */
export class ServerTimeDto {
  @ApiProperty({
    description: 'Server time as an ISO-8601 string',
    example: '2026-09-30T12:00:00.000Z',
    type: String,
  })
  time: string;

  /** Builds the DTO from any Date using one unified ISO-string format. */
  constructor(date: Date) {
    this.time = date.toISOString();
  }
}
