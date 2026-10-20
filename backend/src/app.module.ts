import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AdminUsersController } from './controllers/admin-users.controller.js';
import { ApiKeysController } from './controllers/api-keys.controller.js';
import { AuthController } from './controllers/auth.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { TimeController } from './controllers/time.controller.js';
import { PrismaModule } from './prisma/index.js';
import { SeedModule } from './seed/seed.module.js';
import { ApiKeysService } from './services/api-keys.service.js';
import { AuthService } from './services/auth.service.js';
import { UsersService } from './services/users.service.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

// ServeStaticModule подключается только в prod-режиме (NODE_ENV=production),
// чтобы в dev (start:dev) бэкенд не раздавал статику — фронтенд живёт на
// отдельном dev-сервере Angular (порт 4200) с прокси /api на backend.
const isProd = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'kaufman-bot',
    }),
    PrismaModule,
    SeedModule,
    // В prod (start-prod.sh) собранный Angular-фронт раздаётся бэкендом как
    // статика. Сборка лежит в backend/client/browser (Angular outputPath
    // '../backend/client'). Путь строится от dist/app.module.js, поэтому '..'
    // ведёт в backend, затем 'client/browser'. API и Swagger исключены,
    // иначе wildcard-fallback модуля отдавал бы им index.html вместо ответов API.
    ...(isProd
      ? [
          ServeStaticModule.forRoot({
            rootPath: join(import.meta.dirname, '..', 'client', 'browser'),
            exclude: ['/api/{*path}', '/swagger/{*path}'],
          }),
        ]
      : []),
  ],
  controllers: [
    TimeController,
    HealthController,
    AuthController,
    ApiKeysController,
    AdminUsersController,
  ],
  providers: [ApiKeysService, AuthService, UsersService],
})
export class AppModule {}
