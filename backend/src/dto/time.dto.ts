import { ApiProperty } from '@nestjs/swagger';

/** Response of GET /time — current server time. */
export class ServerTimeDto {
  @ApiProperty({
    description: 'Current server time',
    example: '2026-09-30T12:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  time: Date;

  constructor(time: Date) {
    this.time = time;
  }
}

/** Payload of each SSE event of GET /time/stream. */
export class TimeStreamEventDto {
  @ApiProperty({
    description: 'Server time as ISO-8601 string',
    example: '2026-09-30T12:00:00.000Z',
  })
  time: string;

  constructor(time: string) {
    this.time = time;
  }
}
