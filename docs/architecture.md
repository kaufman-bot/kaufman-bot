# Архитектура

Проектный документ, описывающий топологию NestJS-бэкенда, Angular-фронтенда,
контракт API и подсистему плагинов бота. Каждое утверждение проверяется по
коду — файлы-первоисточники перечислены в конце раздела.

Связанные правила, записанные как skills (обязательны к исполнению):

- [`.agents/skills/backend-module-topology/SKILL.md`](../.agents/skills/backend-module-topology/SKILL.md) —
  ровно один `AppModule`, обёрточные `PrismaModule` / `SeedModule` slated for removal.
- [`.agents/skills/service-layer-split/SKILL.md`](../.agents/skills/service-layer-split/SKILL.md) —
  entity-CRUD-сервисы vs. use-case-сервисы.
- [`.agents/skills/controller-dto-swagger/SKILL.md`](../.agents/skills/controller-dto-swagger/SKILL.md) —
  каждый handler — DTO + Swagger-декораторы.
- [`.agents/skills/prisma-migrations-only/SKILL.md`](../.agents/skills/prisma-migrations-only/SKILL.md) —
  только через `prisma migrate`.

## 1. Топология NestJS-бэкенда

**Ровно один модуль** — `AppModule` в [`backend/src/app.module.ts`](../backend/src/app.module.ts).
Всё остальное — провайдеры, контроллеры или сторонние `imports`.

```ts
@Module({
  imports: [
    ObserveModule.forRoot({
      /* … */
    }),
    PrismaModule, // legacy shim, slated for removal — см. BACKLOG.md #3
    SeedModule, // legacy shim, slated for removal — см. BACKLOG.md #3
    ...(isProd
      ? [
          ServeStaticModule.forRoot({
            rootPath: join(import.meta.dirname, '..', 'client', 'browser'),
            exclude: ['/api/{*path}', '/swagger/{*path}'],
          }),
        ]
      : []),
  ],
  controllers: [TimeController, HealthController, AuthController, ApiKeysController, AdminUsersController, ChatController, MockBotController, ButtonPresetsController, TelegramBotsController, TelegramLaunchController],
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
    TelegramWebhookService,
    BotPluginsService,
    PingPongPlugin,
    TimePlugin,
    SettingsPlugin,
    {
      provide: BOT_PLUGINS,
      useFactory: (pingPong, time, settings) => [pingPong, time, settings],
      inject: [PingPongPlugin, TimePlugin, SettingsPlugin], // order == dispatch priority
    },
  ],
})
export class AppModule {}
```

Ключевые ограничения:

- **Нельзя** плодить `@Module` в `backend/src/<feature>/`; новый сервис — это
  класс в `services/` + строка в `providers[]`.
- **Нельзя** регистрировать несколько `useClass` провайдеров одного токена —
  Nest хранит одну привязку на токен, и «массив стратегии» получается только
  через `useFactory` + `inject` (см. [pitfalls.md](pitfalls.md#nest-multi-provider)).
- **Только** `ObserveModule`, `PrismaModule` (shim), `SeedModule` (shim) и
  `ServeStaticModule` (prod) присутствуют в `imports[]`; новых wrapper-модулей
  не заводим.

## 2. Слой сервисов

Два вида сервисов, не смешиваются (полное правило —
[`service-layer-split`](../.agents/skills/service-layer-split/SKILL.md)):

| Вид                  | Примеры                                                                                                | Ответственность                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| **Entity-CRUD**      | `UsersService`, `ApiKeysService`, `ButtonPresetsService`, `TelegramBotsService`                        | list/get/update/remove одного Prisma-без фоновой композиции |
| **Use-case**         | `AuthService`, `ChatService`, `MockBotService`, `BotPluginsService`, `TelegramBindingService`          | Мультисетевой сценарий: compose + side effects + валидация  |
| **Инфраструктурный** | `ChatEventsService`, `PrismaService`, `SeedService`, `TelegramWebhookService`, `TelegramBridgeService` | Шины, драйверы, bootstrap                                   |

Конкретные примеры:

- `AuthService.register` валидирует email/пароль, создаёт `User` и **первый
  `ApiKey`** — use-case, а не CRUD.
- `AuthService.profile` собирает `User` + `ApiKey` из `ApiKeyGuard`.
- `AuthService.updateProfile` + `normalizeTimezone` — IANA-валидация через
  `Intl.DateTimeFormat`; `normalizeLanguage` (`utils/language.ts`) — проверка
  `language` против поддерживаемого набора, `BadRequestException` иначе.
- `MockBotService.replyAsBot(userId, content?, buttons?)` — use-case: находит
  диалог, пишет `Message(BOT)`, публикует событие.
- `ChatService.sendMessage` — use-case с транзакцией (message + outbox).
- `ChatService.submitButtonCallback` — use-case: пишет `Message(BUTTON)` и
  `BotPluginTask` одной транзакцией (общий хелпер `createMessageWithTask`),
  затем синхронно диспатчит нажатие плагинам с `kind=BUTTON`. Эхо нажатия по
  прежнему скрыто из user-history и SSE пользователя.
- `ButtonPresetsService` — owner-scope CRUD с проверкой `ownerId`.

## 3. URL-контракт и версионирование

Bootstrap в [`backend/src/main.ts`](../backend/src/main.ts):

```ts
app.setGlobalPrefix('api');
app.enableVersioning({
  type: VersioningType.URI,
  prefix: 'v',
  defaultVersion: API_VERSION_V1, // '1'
});
SwaggerModule.setup('swagger', app, document);
await app.listen(process.env.PORT ?? 3000);
```

- Константа `API_VERSION_V1 = '1'` живёт в
  [`backend/src/api-version.ts`](../backend/src/api-version.ts);
  контроллеры без `@Controller({ version })` автоматически получают `/api/v1/...`.
- Breaking change → новая версия (`version: '2'`) в конкретном контроллере.
- `VERSION_NEUTRAL` используется, если эндпоинт не версионируется (в
  `@nestjs/core` 12 в `VersioningOptions` нет `exclude`).
- Swagger UI регистрируется **без префикса** — `/swagger`; `swagger.json`
  пишется в cwd бэкенда при старте.

Итоговые маршруты:

| Префикс                                   | Что                                                   |
| ----------------------------------------- | ----------------------------------------------------- |
| `/api/v1/time`, `/api/v1/time/stream`     | SSE серверного времени (публичный)                    |
| `/api/v1/health`                          | Health-check (публичный)                              |
| `/api/v1/auth/register`, `/auth/login`    | Публичные точки входа                                 |
| `/api/v1/auth/me`, `PATCH /auth/me`       | Профиль по `x-api-key`                                |
| `/api/v1/api-keys*`                       | CRUD ключей владельца                                 |
| `/api/v1/admin/users*`                    | Админ-эндпоинты под `AdminGuard`                      |
| `/api/v1/chat/messages`, `chat/stream`    | Web-chat: история, отправка, SSE                      |
| `/api/v1/chat/button-callbacks`           | Нажатие inline-кнопки (без эха, плагины-opt-in)       |
| `/api/v1/mock-bot/*`                      | Консоль оператора (списки, reply, стрим)              |
| `/api/v1/mock-bot/presets*`               | CRUD button-presets с owner-scope                     |
| `/api/v1/telegram/bots*`                  | CRUD Telegram-ботов с owner-scope                     |
| `/api/v1/admin/users/:id/telegram-target` | Назначение/сброс цели транспорта (ADMIN)              |
| `/api/v1/telegram/launch`                 | Deep-link привязки (AUTH, возвращает url+token)       |
| `/api/telegram/webhook/:botId`            | Публичный приём Telegram-обновлений (VERSION_NEUTRAL) |
| `/swagger`                                | Swagger UI (без `/api/v1`)                            |

**Прокси фронта.** `frontend/proxy.conf.json` перенаправляет `/api` на
`http://localhost:3000`; базовый URL хранится в
[`frontend/src/app/dashboard.service.ts`](../frontend/src/app/dashboard.service.ts)
как `API_V1 = '/api/v1'` и прокидывается в `HttpClient` / `EventSource`.
Абсолютный `http://localhost:3000/...` во фронтенде **запрещён** — он ломает
прод, где SPA живёт на том же порту, что и API.

## 4. Prod-раздача фронтенда (ServeStatic)

`backend/src/app.module.ts` подключает `ServeStaticModule.forRoot` **только
при `NODE_ENV === 'production'`**:

```ts
const isProd = process.env.NODE_ENV === 'production';
```

- В dev (`npm run start:dev`) ServeStatic **не подключается** — GET `/`
  возвращает 404 от Nest; фронт живёт на `ng serve` с портом `:4200` и
  проксирует `/api` на `:3000`.
- В prod (`npm run start:prod` → `NODE_ENV=production node --env-file .env
dist/main.js`) один порт `:3000` обслуживает и Angular-статик, и `/api/*`, и
  `/swagger`.
- `rootPath = join(import.meta.dirname, '..', 'client', 'browser')` — Angular
  `outputPath` в [`frontend/angular.json`](../frontend/angular.json)
  настроен на `../backend/client`, поэтому сборка попадает в
  `backend/client/browser/`. Папка `backend/client/` в gitignore.
- **Обязателен** `exclude: ['/api/{*path}', '/swagger/{*path}']` — static
  middleware регистрируется **до** Nest-роутера, wildcard-fallback иначе
  перехватывал бы GET-запросы к API и Swagger. Паттерны сверены с
  `isRouteExcluded` из `@nestjs/serve-static`; запись вида `/swagger/{*path}`
  **не** покрывает точный `/swagger` и `/swagger/` — при необходимости их
  добавляют отдельными строками.
- `fallthrough` явно не задаётся — SPA-fallback остаётся включённым (в
  справочном `opwork` он выключен через `fallthrough: false` и ломает
  глубокие ссылки).
- `start-prod.sh` собирает Angular и Nest и поднимает PM2; e2e Playwright
  против прод-стека идут на `http://localhost:3000`, и **только** при
  `NODE_ENV=production`.

## 5. Контракт API и SDK

Схема генерации (см. также [`testing.md`](testing.md)):

```
DTO-классы с @ApiProperty/@ApiHeader (controller-dto-swagger skill)
    │
    ▼
Nest + SwaggerModule.createDocument
    │
    ▼
backend/swagger.json        (пишется main.ts при старте)
    │
    ▼
@hey-api/openapi-ts (backend/openapi-ts.config.ts)
    │
    ▼
backend/test/generated/client   (SDK, в VCS)
    │
    ▼
e2e-тесты (ActivityHelper поверх SDK)
```

- `plugins: ['@hey-api/client-fetch', '@hey-api/typescript', { name:
'@hey-api/sdk', operations: { strategy: 'single' } }]`.
- `client-fetch` поддерживает SSE: `client.sse.get({ url, signal })` →
  `{ stream: AsyncGenerator }`, где `data:`-поле парсится как JSON.
- Аннотации влияют на SDK:
  - `@ApiHeader({ required: true })` на guard-эндпоинтах ломает вызовы SDK
    с уже выставленным заголовком → в проекте используется `required: false`.
  - `@ApiQuery({ type: String })` обязателен, иначе схема даёт `schema: {}` и
    query в SDK получается `unknown`.
  - `@ApiUnauthorizedResponse({ type: ErrorDto })` иначе типизирует error как
    `unknown`.
- Сгенерированный SDK **в VCS** — тесты идут без предварительной генерации,
  но `.prettierignore` должен его исключать.

## 6. Модель данных (Prisma)

Схема в [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma).
Только через `prisma migrate` (см.
[`prisma-migrations-only`](../.agents/skills/prisma-migrations-only/SKILL.md)).

| Модель                 | Назначение                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                 | `email` unique, `password` (scrypt-hex), `role` enum, `isActive`, **`timezone`** (IANA или null → UTC), **`language`** (enum `en`/`ru`, default `en`)         |
| `ApiKey`               | `key` unique, `name`, `isActive`, `expiresAt?`, FK → `User` (`onDelete: Cascade`)                                                                             |
| `Conversation`         | `userId` unique — один диалог на пользователя, FK → `User` (`onDelete: Cascade`)                                                                              |
| `Message`              | `conversationId`, `senderRole` (`USER`/`BOT`), `kind` (`TEXT`/`BUTTON`), `content`, **`buttons: Json?`**, `readAt?`                                           |
| `BotPluginTask`        | Outbox-строка: `messageId` unique, `status` enum `PENDING`/`PROCESSING`/`DONE`, индекс `[status, updatedAt]`                                                  |
| `ButtonPreset`         | `ownerId` FK, `name`, `buttons: Json` — набор inline-кнопок, принадлежащий ADMIN-пользователю                                                                 |
| `TelegramBot`          | `ownerId` FK → User (`onDelete: Cascade`), `name`, `botToken`, `botUsername?`, `isActive`, `webhookSecret` (cuid), `settings: Json?` — Telegram-бот оператора |
| `TelegramBindingToken` | `token` unique (крипто-случайный), `userId`, `telegramBotId`, `expiresAt`, `usedAt?` — одноразовый токен привязки chat                                        |

Ключевые semantics:

- **`Message.buttons` — это снимок**. Когда оператор прикладывает пресет к
  reply, сервер копирует `buttons` из пресета в `Message`. Изменение или
  удаление пресета **не переписывает** уже отправленные сообщения
  (Telegram-like).
- **`MessageKind.BUTTON`** означает «пользователь нажал кнопку». Такой
  `Message` виден в консоли оператора, но **скрыт** из user-history и
  SSE-потока пользователя. Нажатие проходит тот же outbox-путь, что и текст:
  `BotPluginTask` заводится, а `dispatchAndReply` получает `kind=BUTTON` и
  предлагает payload только плагинам с `handlesCallbacks`.
- **`BotPluginTask`** — транзакционный outbox. Создаётся в той же
  `prisma.$transaction`, что и `Message(USER)` любого `kind`, и закрывается в
  той же транзакции, что и `Message(BOT)`.
- **`onDelete: Cascade`** — на `ApiKey.user`, `Message.conversation`,
  `BotPluginTask.message`, `ButtonPreset.owner` — админ-удаление аккаунта
  сносит всё зависимое.

## 7. Плагинная система бота и outbox-dispatch

Расширение точки «бот отвечает на сообщения пользователя». Полный контракт:

- Интерфейс
  `BotPlugin { name; handlesCallbacks?; canHandle(content, kind); handle({user, content, kind}) }`
  — [`backend/src/plugins/bot-plugin.interface.ts`](../backend/src/plugins/bot-plugin.interface.ts).
  Ответ — `BotPluginReply` (`string` или `{ text, buttons }`, когда ответ несёт
  inline-клавиатуру).
- `kind` (`BotPluginSourceKind` = `TEXT` / `BUTTON`) различает набранный текст
  и payload нажатой кнопки. Нажатия доходят **только** до плагинов, объявивших
  `handlesCallbacks = true`; иначе диспетчер даже не вызывает `canHandle`,
  поэтому payload, совпадающий с текстовым триггером (например кнопка пресета
  `ping`), остаётся тихим.
- DI-токен `BOT_PLUGINS = Symbol('BOT_PLUGINS')` предоставляется **один раз**
  через `useFactory` + `inject` (порядок = приоритет).
- Диспетчер `BotPluginsService` —
  [`backend/src/plugins/bot-plugins.service.ts`](../backend/src/plugins/bot-plugins.service.ts).

Поток `dispatchAndReply(conversationId, user, content, messageId, kind)`:

1. `prisma.botPluginTask.updateMany({ messageId, status: PENDING } →
PROCESSING)` — cluster-safe захват; `count === 0` → задача уже занята.
2. Ищем `plugins.find((p) => (kind === 'TEXT' || p.handlesCallbacks === true)
&& p.canHandle(content, kind))`.
3. Если совпадения нет — `completeTask(messageId)` (DONE), выходим без reply.
4. `plugin.handle({user, content, kind})` в `try/catch`:
   - ошибка плагина → `Logger.error` + `completeTask(messageId)` **без reply**
     (изоляция — падающий плагин не влияет на пользователя и не ретраится);
   - успех → ответ проходит `prepareReply` (текст после trim обязан непустым,
     кнопки — те же `validateButtons`/`normalizeButtons`, что и клавиатуры
     оператора); невалидный ответ = `Logger.error` + закрытая задача **без
     сообщения**, частичных ответов не бывает;
   - валидный → `$transaction`: `message.create(senderRole=BOT, content,
buttons)` + `botPluginTask.updateMany(PROCESSING → DONE)`.
5. `chatEvents.publish(ChatEvent)` — та же шина, что у `MockBotService.replyAsBot`;
   в событие кладутся и `buttons` ответа.
6. `processPendingTask` восстанавливает `kind` из `message.kind`
   (`BUTTON → 'BUTTON'`), поэтому sweep приводит к тому же плагину, что и
   живой путь.

Восстановление после рестартов:

- `onApplicationBootstrap` → `runRecoverySweep()` + `setInterval(sweep, 30_000)`.
- Sweep: `PROCESSING` с `updatedAt < now() - 60_000` → обратно в `PENDING`,
  потом обход всех `PENDING` через обычный `dispatchAndReply`.
- Порог `STALE_PROCESSING_MS = 60_000` заметно выше типового времени
  обработки — живой cluster-worker не losing-ит задачу.
- `sweeping`-флаг защищает от параллельных sweep'ов в пределах процесса; при
  переходе на Redis флаг заменяется на Redlock (
  [`../BACKLOG.md`](../BACKLOG.md#2) — «now / do / when»).

Приёмка сообщения (общий хелпер `createMessageWithTask`, его используют и
`sendMessage`, и `submitButtonCallback`):

```ts
// backend/src/services/chat.service.ts
const message = await this.createMessageWithTask({
  conversationId,
  senderRole: MessageSenderRole.USER,
  kind: MessageKind.TEXT, // или MessageKind.BUTTON для нажатия кнопки
  content,
});

// внутри — одна транзакция:
this.prisma.$transaction(async (tx) => {
  const created = await tx.message.create({ data });
  await tx.botPluginTask.create({ data: { messageId: created.id } });
  return created;
});
```

Гарантия: **или** сообщение пользователя + задача outbox, **или** ничего —
одинаково для набранного текста и для нажатия кнопки. Никакого «потерянного»
сообщения, если сервер упадёт между INSERT-ом и publish'ем.

Добавление нового плагина:

1. Класс `backend/src/plugins/<name>.plugin.ts` + юнит-тест рядом.
2. Провайдер в `AppModule.providers`.
3. Элемент `inject`-списка в `BOT_PLUGINS`-`useFactory` (позиция = приоритет).
4. `handlesCallbacks = true` — только если плагин правда реагирует на нажатия
   кнопок; текстовые плагины его не объявляют.
5. `ChatService` и `BotPluginsService` **не трогаем**.

`SettingsPlugin`
([`backend/src/plugins/settings.plugin.ts`](../backend/src/plugins/settings.plugin.ts))
— первый плагин с `handlesCallbacks = true`: `/settings` рендерит экран
настроек с кнопками поддерживаемых языков (текущий помечен `✓ `), а нажатие
`settings:language:<en|ru>` сохраняет язык и подтверждает смену уже на новом
языке. Вся область `settings:language:` принадлежит этому плагину, поэтому и
код вне перечня (`settings:language:de`, пустой код, список `ru,en`) даёт
ответ — сообщение об отказе на том активном языке, который остался, без
записи в профиль; payload чужих областей (`ping`, `presets:*`,
`settings:lang:*`) по-прежнему молчат. Отказ — обычный reply: он приходит
отдельным `BOT`-сообщением (история + SSE, при падении процесса —
recovery-sweep), поэтому HTTP-отклик нажатия остаётся `201` и текста ошибки не
содержит. Тексты живут в таблице `{ en, ru }` внутри плагина — общий i18n для
остальных строк отложен, см. [`../BACKLOG.md`](../BACKLOG.md).

Автообнаружение плагинов (без правки `app.module.ts`) отложено — см.
[`../BACKLOG.md`](../BACKLOG.md).

## 8. SSE и шины событий

- `ChatEventsService`
  ([`backend/src/services/chat-events.service.ts`](../backend/src/services/chat-events.service.ts)) —
  тонкая обёртка над RxJS `Subject`. Публикует `ChatEvent` в `next()`,
  подписывается через `asObservable()`+`filter`.
- `ChatController.@Sse('stream')` маппит события в `MessageEvent` и
  фильтрует по `conversationId`.
- Клиент фронта — `EventSource` с `?apiKey=` (query-параметр разрешён
  `ApiKeyGuard`-ом; сам заголовок EventSource выставить не может).
- При `es.onopen` выставляется флаг `reconnected` и фронт **перезагружает
  историю** — иначе события, случившиеся во время разрыва, теряются.
- Долг: RxJS Subject не масштабируется на cluster-режим; при внедрении Redis
  заменяется на event bus / очередь (см. [`../BACKLOG.md`](../BACKLOG.md#1)).

## 9. Telegram Bridge (двусторонний мост)

[`backend/src/services/telegram-bridge.service.ts`](../backend/src/services/telegram-bridge.service.ts)
— инфраструктурный сервис, связывающий внутренний chat-движок с Telegram Bot API.

**Поток вебхука:**

- `TelegramWebhookController` (`POST /api/telegram/webhook/:botId`,
  `VERSION_NEUTRAL`) принимает JSON `Update` от Telegram; без `ApiKeyGuard`.
- Аутентификация — заголовок `X-Telegram-Bot-Api-Secret-Token`, сверяемый с
  `TelegramBot.webhookSecret`. Несовпадение → `403`, update не обрабатывается.
- `VERSION_NEUTRAL` гарантирует стабильность URL: уже зарегистрированные в
  Telegram вебхуки не «отвалятся» при переходе API на v2.

**Исходящие (BOT → Telegram):**

- `onApplicationBootstrap` подписывается на `chatEvents.streamAll()`;
  фильтр `senderRole === 'BOT'`.
- Резолвит `conversationId → user`; пропускает только при
  `telegramBotId != null` **и** `telegramChatId` непуст **и** `bot.isActive`.
- Текст + `buttons` (из `ChatEvent`) → `TelegramSender.sendMessage`; кнопки с
  `callbackData` > 64 **байт** в разметку не кладутся (лимит Telegram), чтобы
  `sendMessage` не получил `400`.
- Реестр `TelegramSender` (grammy `Bot` per bot id) кешируется; при смене
  токена (`invalidateSender`) пересоздаётся.

**Входящие (Telegram → internal):**

- `/start <token>` → `TelegramBindingService.consumeToken(token, chatId)` →
  `user.telegramChatId = chatId` + подтверждение в чат.
- Текст от привязанного `chatId` → тот же outbox-путь, что
  `ChatService.sendMessage(user, text)`; ответ бота уходит по исходящей подписке.
- `callback_query` от привязанного `chatId` → `answerCallbackQuery` (снять
  спиннер) + `ChatService.submitButtonCallback(user, { callbackData })`.
- От непривязанного `chatId` / выключенного бота — тихий игнор.

**Почему `instances: 1` в `ecosystem-prod.config.cjs`:**

`ChatEventsService` — in-memory RxJS `Subject`. При cluster-режиме (>1 воркер)
каждый процесс получает свою копию события и отправляет исходящее в Telegram
повторно. До внедрения Redis-дедупликации (см.
[`BACKLOG.md`](../BACKLOG.md) #1/#2) удерживается `instances: 1`.

## 10. Guards и роли

- `ApiKeyGuard` — читает `x-api-key` **или** `?apiKey=`, резолвит
  `findActiveByKey(key) → KeyLookupResult` (`{apiKey,user}` | `{error: '...'}`
  с специфичным сообщением: «API key expired», «User is inactive» и т.п.).
- `AdminGuard` — требует `role === ADMIN` на запросе; навешивается **вторым**
  на админ-эндпоинты.
- Роли: `USER`, `ADMIN`, `GUEST` (Prisma enum `Role`). Дефолт при
  регистрации — `USER`.

## 11. Frontend-структура (Angular)

Standalone-компоненты + `signal()` + `@if/@for`-контроль. Ключевые места:

- [`frontend/src/app/app.routes.ts`](../frontend/src/app/app.routes.ts) —
  `/login`, `/chat`, `/mock-bot`, дашборд под `requireAuthGuard` /
  `adminAuthGuard`.
- `SessionService` — signal + `localStorage`; `restore()` (идемпотентный,
  вызывается из `provideAppInitializer`, а не из конструктора —
  см. [http-in-constructor-interceptor-cycle](pitfalls.md#http-in-constructor-interceptor-cycle))
  возвращает в сессию сохранённый ключ после F5, `whenReady()` — точка
  ожидания для guards; `syncTimezone()` вызывает `PATCH /auth/me` после
  логина при несовпадении IANA-таймзоны браузера.
- `auth.interceptor.ts` — подмешивает `x-api-key`; `401` завершает сессию.
- `ChatService` — `EventSource` на `/api/v1/chat/stream?apiKey=…`, сигнал
  `reconnected` и refetch истории.
- `MockBotService`, `ButtonPresetsService` — консоль оператора: переключение
  между пользователями, reply с кнопками, CRUD пресетов.

Jest-тесты компонентов, Playwright-e2e — см. [`testing.md`](testing.md).

## 11. Тестовый контур (краткий обзор)

- **Backend unit** (`vitest`) — `backend/src/**/*.spec.ts`; 126 тестов на
  момент написания документа.
- **Backend e2e** — `backend/test/*.e2e-spec.ts` против **живого** бэкенда
  через сгенерированный OpenAPI SDK. 104 теста, без `Test.createTestingModule`.
- **Frontend unit** — Jest + `jest-preset-angular`; 90 тестов.
- **Frontend e2e** — Playwright против прод-стека (`start:prod`) или dev
  (`:4200`);详见 [`testing.md`](testing.md).

## Источники

| Файл                                                                                                    | Роль в этом документе                                |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`backend/src/main.ts`](../backend/src/main.ts)                                                         | Bootstrap, prefix, versioning, Swagger               |
| [`backend/src/api-version.ts`](../backend/src/api-version.ts)                                           | `API_VERSION_V1`                                     |
| [`backend/src/app.module.ts`](../backend/src/app.module.ts)                                             | Единственный Nest-модуль                             |
| [`backend/src/plugins/*`](../backend/src/plugins)                                                       | BOT_PLUGINS, dispatcher, outbox sweep                |
| [`backend/src/services/*`](../backend/src/services)                                                     | entity-CRUD + use-case сервисы                       |
| [`backend/src/guards/*`](../backend/src/guards)                                                         | ApiKeyGuard, AdminGuard                              |
| [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma)                                       | Модель данных, enums, cascade                        |
| [`backend/openapi-ts.config.ts`](../backend/openapi-ts.config.ts)                                       | Конфигурация генератора SDK                          |
| [`frontend/proxy.conf.json`](../frontend/proxy.conf.json)                                               | Прокси dev-сервера                                   |
| [`frontend/angular.json`](../frontend/angular.json)                                                     | `outputPath: '../backend/client'`, serve.proxyConfig |
| [`.agents/skills/backend-module-topology/SKILL.md`](../.agents/skills/backend-module-topology/SKILL.md) | Жёсткое правило «один AppModule» + BACKLOG           |
| [`.agents/skills/service-layer-split/SKILL.md`](../.agents/skills/service-layer-split/SKILL.md)         | Правило «CRUD vs use-case»                           |
| [`.agents/skills/controller-dto-swagger/SKILL.md`](../.agents/skills/controller-dto-swagger/SKILL.md)   | Правило DTO + Swagger                                |
