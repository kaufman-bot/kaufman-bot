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
    await this.seedDefaultUser('USER1');
    await this.seedDefaultUser('USER2');
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

  /**
   * Seeds a default USER-role account and its API key from env variables
   * prefixed with the given name (e.g. USER1_EMAIL, USER1_PASSWORD, USER1_API_KEY).
   * Skips with a warning if any of the three variables is missing.
   */
  private async seedDefaultUser(prefix: string) {
    const email = process.env[`${prefix}_EMAIL`];
    const password = process.env[`${prefix}_PASSWORD`];
    const apiKey = process.env[`${prefix}_API_KEY`];

    if (!email || !password || !apiKey) {
      this.logger.warn(
        `Skipping ${prefix} seed: ${prefix}_EMAIL, ${prefix}_PASSWORD, ${prefix}_API_KEY must all be set`,
      );
      return;
    }

    const user = await this.prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        password: hashPassword(password),
        role: Role.USER,
      },
    });

    this.logger.log(`${prefix} user ensured: ${user.email} (id: ${user.id})`);

    const key = await this.prisma.apiKey.upsert({
      where: { key: apiKey },
      update: {},
      create: {
        key: apiKey,
        name: `Default ${prefix} key`,
        userId: user.id,
      },
    });

    this.logger.log(`${prefix} API key ensured: ${key.name} (id: ${key.id})`);
  }
}
