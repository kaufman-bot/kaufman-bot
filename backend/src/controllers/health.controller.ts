import { Controller, Get } from '@nestjs/common';
import * as os from 'os';
import { PrismaService } from '../prisma/prisma.service.js';

interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: Date;
  uptime: number;
  database: {
    status: 'connected' | 'disconnected';
    latencyMs?: number;
  };
  stats: {
    users: number;
    apiKeys: number;
  };
  server: {
    hostname: string;
    platform: string;
    arch: string;
    nodeVersion: string;
    memory: {
      totalMb: number;
      freeMb: number;
      usedMb: number;
      usedPercent: number;
    };
    cpu: {
      model: string;
      cores: number;
      loadAvg: number[];
    };
  };
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthStatus> {
    const [dbCheck, users, apiKeys] = await Promise.all([
      this.checkDatabase(),
      this.prisma.user.count(),
      this.prisma.apiKey.count(),
    ]);

    return {
      status: dbCheck.status === 'connected' ? 'ok' : 'error',
      timestamp: new Date(),
      uptime: os.uptime(),
      database: dbCheck,
      stats: { users, apiKeys },
      server: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        memory: this.getMemoryInfo(),
        cpu: this.getCpuInfo(),
      },
    };
  }

  private async checkDatabase(): Promise<{
    status: 'connected' | 'disconnected';
    latencyMs?: number;
  }> {
    try {
      const start = performance.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Math.round(performance.now() - start);
      return { status: 'connected', latencyMs };
    } catch {
      return { status: 'disconnected' };
    }
  }

  private getMemoryInfo() {
    const totalMb = Math.round(os.totalmem() / 1024 / 1024);
    const freeMb = Math.round(os.freemem() / 1024 / 1024);
    const usedMb = totalMb - freeMb;
    return {
      totalMb,
      freeMb,
      usedMb,
      usedPercent: Math.round((usedMb / totalMb) * 100),
    };
  }

  private getCpuInfo() {
    const cpus = os.cpus();
    return {
      model: cpus[0]?.model ?? 'unknown',
      cores: cpus.length,
      loadAvg: os.loadavg().map((v) => Math.round(v * 100) / 100),
    };
  }
}
