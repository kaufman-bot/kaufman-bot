import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword } from '../utils/hashPassword.js';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    this.logger.log('Seeding default data...');
    await this.seedDefaultAdmin();
  }

  private async seedDefaultAdmin() {
    const email = process.env['ADMIN_EMAIL'];
    const password = process.env['ADMIN_PASSWORD'];
    const apiKey = process.env['ADMIN_API_KEY'];

    if (!email || !password || !apiKey) {
      this.logger.warn(
        'Skipping admin seed: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_API_KEY must be set',
      );
      return;
    }

    const admin = await this.prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        password: hashPassword(password),
        role: Role.ADMIN,
      },
    });

    this.logger.log(`Admin user ensured: ${admin.email} (id: ${admin.id})`);

    const key = await this.prisma.apiKey.upsert({
      where: { key: apiKey },
      update: {},
      create: {
        key: apiKey,
        name: 'Default admin key',
        userId: admin.id,
      },
    });

    this.logger.log(`Admin API key ensured: ${key.name} (id: ${key.id})`);
  }
}
