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
    await this.seedTaxiDictionaries();
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

  /**
   * Seeds the default taxi dictionaries (cities, extra services, departure
   * slots, passenger options) — but only those tables that are still empty.
   * Admin-edited or partially-modified dictionaries are never overwritten or
   * duplicated (spec taxi-catalog-admin, "Повторный запуск").
   */
  private async seedTaxiDictionaries() {
    await this.seedIfEmpty(
      'taxi cities',
      () => this.prisma.taxiCity.count(),
      () =>
        this.prisma.taxiCity.createMany({
          data: [
            { name: 'Москва', distanceKm: 0, sortOrder: 0 },
            { name: 'Тверь', distanceKm: 167, sortOrder: 1 },
            { name: 'Вышний Волочёк', distanceKm: 297, sortOrder: 2 },
            { name: 'Бологое', distanceKm: 377, sortOrder: 3 },
            { name: 'Великий Новгород', distanceKm: 531, sortOrder: 4 },
            { name: 'Чудово', distanceKm: 585, sortOrder: 5 },
            { name: 'Санкт-Петербург', distanceKm: 700, sortOrder: 6 },
          ],
        }),
    );

    await this.seedIfEmpty(
      'taxi extra services',
      () => this.prisma.taxiExtraService.count(),
      () =>
        this.prisma.taxiExtraService.createMany({
          data: [
            {
              name: 'Детское кресло',
              surcharge: 300,
              isCarFeature: true,
              sortOrder: 0,
            },
            {
              name: 'Перевозка животных',
              surcharge: 200,
              isCarFeature: true,
              sortOrder: 1,
            },
            {
              name: 'Курение в салоне',
              surcharge: 0,
              isCarFeature: true,
              sortOrder: 2,
            },
            {
              name: 'Кондиционер',
              surcharge: 0,
              isCarFeature: true,
              sortOrder: 3,
            },
            {
              name: 'Музыка в салоне',
              surcharge: 0,
              isCarFeature: true,
              sortOrder: 4,
            },
            {
              name: 'Тишина в салоне',
              surcharge: 0,
              isCarFeature: false,
              sortOrder: 5,
            },
            {
              name: 'Помощь с багажом',
              surcharge: 100,
              isCarFeature: false,
              sortOrder: 6,
            },
            {
              name: 'Вода для пассажира',
              surcharge: 100,
              isCarFeature: false,
              sortOrder: 7,
            },
            {
              name: 'Зарядка для телефона',
              surcharge: 50,
              isCarFeature: false,
              sortOrder: 8,
            },
          ],
        }),
    );

    await this.seedIfEmpty(
      'taxi departure slots',
      () => this.prisma.taxiDepartureSlot.count(),
      () =>
        this.prisma.taxiDepartureSlot.createMany({
          data: [
            { time: '08:00', sortOrder: 0 },
            { time: '12:00', sortOrder: 1 },
            { time: '16:00', sortOrder: 2 },
            { time: '20:00', sortOrder: 3 },
          ],
        }),
    );

    await this.seedIfEmpty(
      'taxi passenger options',
      () => this.prisma.taxiPassengerOption.count(),
      () =>
        this.prisma.taxiPassengerOption.createMany({
          data: [1, 2, 3, 4].map((count, i) => ({ count, sortOrder: i })),
        }),
    );
  }

  /** Runs `seed` only when `count` reports an empty table. */
  private async seedIfEmpty(
    label: string,
    count: () => Promise<number>,
    seed: () => Promise<unknown>,
  ) {
    if ((await count()) > 0) {
      return;
    }
    await seed();
    this.logger.log(`Seeded default ${label}`);
  }
}
