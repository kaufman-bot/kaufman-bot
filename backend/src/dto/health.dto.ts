import { ApiExtraModels, ApiProperty } from '@nestjs/swagger';

/** Database connectivity part of the health report. */
export class DatabaseStatusDto {
  @ApiProperty({ enum: ['connected', 'disconnected'] })
  status: 'connected' | 'disconnected';

  @ApiProperty({
    description: 'Round-trip latency to the database, ms',
    example: 3,
    required: false,
    type: Number,
  })
  latencyMs?: number;
}

/** Usage counters reported by the health check. */
export class HealthStatsDto {
  @ApiProperty({ description: 'Registered users', example: 1 })
  users: number;

  @ApiProperty({ description: 'Issued API keys', example: 1 })
  apiKeys: number;
}

/** Server memory usage. */
export class MemoryInfoDto {
  @ApiProperty({ description: 'Total memory, MB', example: 32768 })
  totalMb: number;

  @ApiProperty({ description: 'Free memory, MB', example: 8192 })
  freeMb: number;

  @ApiProperty({ description: 'Used memory, MB', example: 24576 })
  usedMb: number;

  @ApiProperty({ description: 'Used memory, percent', example: 75 })
  usedPercent: number;
}

/** Server CPU info. */
export class CpuInfoDto {
  @ApiProperty({
    description: 'CPU model name',
    example: 'Intel(R) Core(TM) i7-10700 CPU @ 2.90GHz',
  })
  model: string;

  @ApiProperty({ description: 'Core count', example: 8 })
  cores: number;

  @ApiProperty({
    description: 'Load averages for 1/5/15 minutes',
    example: [1.25, 0.9, 0.75],
    type: [Number],
  })
  loadAvg: number[];
}

/** Server host info reported by the health check. */
export class ServerInfoDto {
  @ApiProperty({ description: 'Hostname', example: 'srv01' })
  hostname: string;

  @ApiProperty({ description: 'OS platform', example: 'linux' })
  platform: string;

  @ApiProperty({ description: 'CPU architecture', example: 'x64' })
  arch: string;

  @ApiProperty({ description: 'Node.js version', example: 'v24.0.0' })
  nodeVersion: string;

  @ApiProperty({ type: MemoryInfoDto })
  memory: MemoryInfoDto;

  @ApiProperty({ type: CpuInfoDto })
  cpu: CpuInfoDto;
}

/** Full response of GET /health. */
@ApiExtraModels(
  DatabaseStatusDto,
  HealthStatsDto,
  ServerInfoDto,
  MemoryInfoDto,
  CpuInfoDto,
)
export class HealthStatusDto {
  @ApiProperty({ enum: ['ok', 'error'] })
  status: 'ok' | 'error';

  @ApiProperty({
    description: 'Server timestamp of the response',
    example: '2026-09-30T12:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  timestamp: Date;

  @ApiProperty({ description: 'Process uptime, seconds', example: 3600 })
  uptime: number;

  @ApiProperty({ type: DatabaseStatusDto })
  database: DatabaseStatusDto;

  @ApiProperty({ type: HealthStatsDto })
  stats: HealthStatsDto;

  @ApiProperty({ type: ServerInfoDto })
  server: ServerInfoDto;
}
