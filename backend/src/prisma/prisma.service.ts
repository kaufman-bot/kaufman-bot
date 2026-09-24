import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private static instance: PrismaService;

  constructor() {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
    PrismaService.instance = this;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  static getInstance(): PrismaService {
    if (!PrismaService.instance) {
      throw new Error('PrismaService is not initialized');
    }
    return PrismaService.instance;
  }
}
