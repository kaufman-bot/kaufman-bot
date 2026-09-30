import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import * as os from 'os';
import {
  CpuInfoDto,
  DatabaseStatusDto,
  HealthStatsDto,
  HealthStatusDto,
  MemoryInfoDto,
  ServerInfoDto,
} from '../dto/health.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Health check',
    description:
      'Returns service status, database connectivity/latency, usage stats and server info.',
  })
  @ApiOkResponse({ type: HealthStatusDto })
  @ApiResponse({ status: 503, type: HealthStatusDto })
  async check(): Promise<HealthStatusDto> {
    const [dbCheck, users, apiKeys] = await Promise.all([
      this.checkDatabase(),
      this.prisma.user.count(),
      this.prisma.apiKey.count(),
    ]);

    const stats: HealthStatsDto = { users, apiKeys };
    const server: ServerInfoDto = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      memory: this.getMemoryInfo(),
      cpu: this.getCpuInfo(),
    };

    return {
      status: dbCheck.status === 'connected' ? 'ok' : 'error',
      timestamp: new Date(),
      uptime: os.uptime(),
      database: dbCheck,
      stats,
      server,
    } satisfies HealthStatusDto;
  }

  private async checkDatabase(): Promise<DatabaseStatusDto> {
    try {
      const start = performance.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Math.round(performance.now() - start);
      return { status: 'connected', latencyMs } satisfies DatabaseStatusDto;
    } catch {
      return { status: 'disconnected' } satisfies DatabaseStatusDto;
    }
  }

  private getMemoryInfo(): MemoryInfoDto {
    const totalMb = Math.round(os.totalmem() / 1024 / 1024);
    const freeMb = Math.round(os.freemem() / 1024 / 1024);
    const usedMb = totalMb - freeMb;
    return {
      totalMb,
      freeMb,
      usedMb,
      usedPercent: Math.round((usedMb / totalMb) * 100),
    } satisfies MemoryInfoDto;
  }

  private getCpuInfo(): CpuInfoDto {
    const cpus = os.cpus();
    return {
      model: cpus[0]?.model ?? 'unknown',
      cores: cpus.length,
      loadAvg: os.loadavg().map((v) => Math.round(v * 100) / 100),
    } satisfies CpuInfoDto;
  }
}
