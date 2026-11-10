import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AdminUsersController } from './controllers/admin-users.controller.js';
import { ApiKeysController } from './controllers/api-keys.controller.js';
import { AuthController } from './controllers/auth.controller.js';
import { ButtonPresetsController } from './controllers/button-presets.controller.js';
import { ChatController } from './controllers/chat.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { MockBotController } from './controllers/mock-bot.controller.js';
import { TelegramBotsController } from './controllers/telegram-bots.controller.js';
import { TelegramLaunchController } from './controllers/telegram-launch.controller.js';
import { TelegramWebhookController } from './controllers/telegram-webhook.controller.js';
import { TimeController } from './controllers/time.controller.js';
import { BOT_PLUGINS } from './plugins/bot-plugin.interface.js';
import { BotPluginsService } from './plugins/bot-plugins.service.js';
import { PingPongPlugin } from './plugins/ping-pong.plugin.js';
import { SettingsPlugin } from './plugins/settings.plugin.js';
import { TimePlugin } from './plugins/time.plugin.js';
import { PrismaModule } from './prisma/index.js';
import { SeedModule } from './seed/seed.module.js';
import { ApiKeysService } from './services/api-keys.service.js';
import { AuthService } from './services/auth.service.js';
import { ButtonPresetsService } from './services/button-presets.service.js';
import { ChatEventsService } from './services/chat-events.service.js';
import { ChatService } from './services/chat.service.js';
import { MockBotService } from './services/mock-bot.service.js';
import { TelegramBindingService } from './services/telegram-binding.service.js';
import { TelegramBotsService } from './services/telegram-bots.service.js';
import { TelegramBridgeService } from './services/telegram-bridge.service.js';
import { TelegramWebhookService } from './services/telegram-webhook.service.js';
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
    ChatController,
    MockBotController,
    ButtonPresetsController,
    TelegramBotsController,
    TelegramLaunchController,
    TelegramWebhookController,
  ],
  providers: [
    ApiKeysService,
    AuthService,
    ButtonPresetsService,
    ChatEventsService,
    ChatService,
    MockBotService,
    UsersService,
    TelegramBotsService,
    TelegramBindingService,
    TelegramBridgeService,
    TelegramWebhookService,
    // Bot plugins: each plugin is instantiated as its own provider and then
    // aggregated once under the shared BOT_PLUGINS token. Nest does not merge
    // several providers of one token into an array (the last one would win),
    // so the token is provided via a factory — the inject list order below is
    // the dispatch priority (first match wins). Registering a new plugin
    // today means editing this factory; decoupled auto-registration
    // (decorator + discovery, no AppModule edits) is deferred — see BACKLOG.md.
    BotPluginsService,
    PingPongPlugin,
    TimePlugin,
    SettingsPlugin,
    {
      provide: BOT_PLUGINS,
      useFactory: (
        pingPong: PingPongPlugin,
        time: TimePlugin,
        settings: SettingsPlugin,
      ) => [pingPong, time, settings],
      inject: [PingPongPlugin, TimePlugin, SettingsPlugin],
    },
  ],
})
export class AppModule {}
