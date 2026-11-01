# Tasks

## 1. Миграция таймзоны пользователя

- [x] 1.1 Добавить в `backend/prisma/schema.prisma` поле `timezone String?` модели `User`, создать миграцию `npx prisma migrate dev --name add_timezone_to_users` из `backend/` и сгенерировать клиент `npx prisma generate`; проверка: миграция создана без ошибок, `npx tsc --noEmit -p tsconfig.json` в `backend/` — exit 0

## 2. Контракт плагинной системы

- [x] 2.1 Создать `backend/src/plugins/bot-plugin.interface.ts`: токен `BOT_PLUGINS`, интерфейсы `BotPlugin` (`name`, `canHandle(content)`, `handle(context)`) и `BotPluginContext` (`user`, `content`), комментарий о порядке регистрации; проверка: `npx tsc --noEmit -p tsconfig.json` в `backend/` — exit 0

## 3. Диспетчер плагинов

- [x] 3.1 Создать `backend/src/plugins/bot-plugins.service.ts` (`BotPluginsService.dispatchAndReply(conversationId, user, content)`): первый `canHandle` → `handle` → сохранение `BOT`-сообщения через `PrismaService` + публикация `ChatEvent` через `ChatEventsService` (по образцу `MockBotService.replyAsBot`); проверка: юнит-тесты на моках проходят
- [x] 3.2 Юнит-тесты `backend/src/plugins/bot-plugins.service.spec.ts`: ответ первого сработавшего плагина, отсутствие матча (void), проглатывание ошибки плагина (void без throw), сохранение сообщения и публикация события при ответе; проверка: `npx vitest run` в `backend/` — зелёный

## 4. Плагины ping и time

- [x] 4.1 Создать `backend/src/plugins/ping-pong.plugin.ts`: матчинг точного `ping` после trim без учёта регистра, ответ `pong`; юнит-тесты `ping-pong.plugin.spec.ts` (регистр, пробелы, частичное вхождение — нет срабатывания); проверка: `npx vitest run` в `backend/` — зелёный
- [x] 4.2 Создать `backend/src/plugins/time.plugin.ts`: матчинг точного `time`, формат `YYYY-MM-DD HH:mm:ss (<tz>)` через `Intl.DateTimeFormat` (`en-CA` дата, `en-GB` время `h23`), при `user.timezone === null` — `(UTC)`; юнит-тесты `time.plugin.spec.ts` с фиксированным моментом (смещение Europe/Moscow, fallback UTC, лишние символы — нет срабатывания); проверка: `npx vitest run` в `backend/` — зелёный

## 5. Встраивание плагинов в чат

- [x] 5.1 В `ChatService.sendMessage` после публикации события сообщения пользователя вызвать `BotPluginsService.dispatchAndReply` (await, обёртка `try/catch` c `Logger.error`); дополнить `chat.service.spec.ts`: диспетчер вызывается с id диалога и текстом, ошибка диспетчера не меняет успешный ответ `sendMessage`; проверка: `npx vitest run` в `backend/` — зелёный

## 6. Таймзона в профиле и PATCH /auth/me

- [x] 6.1 Добавить `timezone: string | null` в `AuthProfileUserDto` (`@ApiProperty({ nullable: true, type: String })`) и заполнять его в `AuthService.profile`; добавить `UpdateProfileRequestDto` (`timezone?: string | null`) в `backend/src/dto/auth.dto.ts`; проверка: `npx tsc --noEmit` в `backend/` — exit 0
- [x] 6.2 Реализовать `AuthService.updateProfile(user, dto)`: валидация IANA в сервисе (`new Intl.DateTimeFormat('en-US', { timeZone })` в try/catch → `BadRequestException`), trim, `prisma.user.update`, ответ — существующий `AuthProfileDto`; дополнить `auth.service.spec.ts` (валидная/невалидная/`null` таймзона, поле отсутствует — без изменения); проверка: `npx vitest run` в `backend/` — зелёный
- [x] 6.3 Добавить `@Patch('me')` в `AuthController` (`@UseGuards(ApiKeyGuard)`, Swagger по паттерну `GET /auth/me`: `@ApiHeader`/`@ApiQuery` с `required: false`, `@ApiOkResponse({ type: AuthProfileDto })`, `@ApiBadRequestResponse`/`@ApiUnauthorizedResponse` c `ApiErrorDto`); проверка: `npx tsc --noEmit` — exit 0, oxlint без новых замечаний

## 7. Регистрация в AppModule и документация

- [x] 7.1 Зарегистрировать в `backend/src/app.module.ts`: `BotPluginsService`, `PingPongPlugin`, `TimePlugin` и multi-provider `{ provide: BOT_PLUGINS, useClass: PingPongPlugin }`, `{ provide: BOT_PLUGINS, useClass: TimePlugin }` (порядок = приоритет); проверка: `npx tsc --noEmit` — exit 0, `npx vitest run` — зелёный
- [x] 7.2 Дополнить `backend/README.md` разделом о плагинной системе (контракт `BotPlugin`, как добавить плагин, где хранится таймзона, `PATCH /api/v1/auth/me`); проверка: раздел присутствует в README, команды из него соответствуют коду

## 8. Перегенерация Swagger и SDK

- [x] 8.1 Перезапустить бэкенд (`npm run start:dev` из `backend/`) для записи `swagger.json` и выполнить `npm run generate:openapi-ts`; проверка: в `swagger.json` есть `PATCH /api/v1/auth/me` и `timezone` в профиле, в `backend/test/generated/client` появились новые типизированные операции

## 9. E2E-тесты на живом бэкенде

- [x] 9.1 Дополнить `backend/test/auth.e2e-spec.ts`: `PATCH /auth/me` — 200 с обновлённой таймзоной, 400 на невалидную строку, 401 без ключа, очистка через `timezone: null`, `timezone` в ответах `login`/`me`; проверка: `npm run test:e2e` — зелёный
- [x] 9.2 Создать `backend/test/plugins.e2e-spec.ts` (SDK + ActivityHelper): `ping`/`PING` → `pong` в истории и по SSE; `ping pong`, `ping!` → ответа нет; установка `timezone: Europe/Moscow` через `PATCH /auth/me`, затем `time` → ответ по формату и с корректным смещением; `time` без таймзоны → `(UTC)`; ответ оператора мок-бота текстом `ping` не триггерит плагин; проверка: `npm run test:e2e` — зелёный

## 10. Фронтенд: синхронизация таймзоны

- [x] 10.1 Обновить типы профиля в `frontend/src/app/session.service.ts` (`timezone`) и реализовать `syncTimezone()`: определение `Intl.DateTimeFormat().resolvedOptions().timeZone`, вызов PATCH только при расхождении, обновление сигналов профиля, `isPlatformBrowser` и глотание ошибок; вызвать после успешного `login()` и после восстановления сессии; проверка: `npm test` в `frontend/` — зелёный
- [x] 10.2 Юнит-тесты `session.service.spec.ts`: PATCH вызывается при расхождении таймзон, не вызывается при совпадении, ошибка запроса не прерывает сессию; проверка: `npm test` в `frontend/` — зелёный

## 11. Финальная интеграция

- [x] 11.1 Полный прогон верификации: юнит-тесты бэкенда (`npx vitest run`), e2e (`npm run test:e2e`), тесты фронта (`npm test`), сборка фронта (`ng build`) — все зелёные
- [x] 11.2 Ручная проверка сценария на запущенном стеке: вход, сообщение `ping` → `pong` в веб-чате без перезагрузки (SSE), `time` → время в локальной таймзоне браузера; проверка: поведение совпадает со сценариями спецификаций

## 12. Надёжность обработки при перезапусках

- [x] 12.1 Добавить в `backend/prisma/schema.prisma` модель `BotPluginTask` (`messageId` unique FK → `Message`, `status` enum `BotPluginTaskStatus` PENDING/PROCESSING/DONE, `createdAt`/`updatedAt`) и enum, создать миграцию `npx prisma migrate dev --name add_bot_plugin_tasks` из `backend/` и выполнить `npx prisma generate`; проверка: миграция создана без ошибок, `npx tsc --noEmit -p tsconfig.json` в `backend/` — exit 0
- [x] 12.2 В `ChatService.sendMessage` создать сообщение пользователя и `botPluginTask.create` в одном `prisma.$transaction`, передать id сообщения в диспетчер; дополнить `chat.service.spec.ts`: задача создаётся вместе с сообщением, сбой транзакции не оставляет сообщение без задачи; проверка: `npx vitest run` в `backend/` — зелёный
- [x] 12.3 В `BotPluginsService.dispatchAndReply`: захват задачи по `messageId` (условный `updateMany` PENDING→PROCESSING, обработка только при `count === 1`), сохранение BOT-сообщения и перевод задачи в DONE в одном `prisma.$transaction`, при отсутствии матча — только DONE; дополнить `bot-plugins.service.spec.ts`: повторный захват невозможен, DONE после ответа, DONE без ответа при отсутствии матча; проверка: `npx vitest run` в `backend/` — зелёный
- [x] 12.4 Восстановление в `BotPluginsService` (`OnApplicationBootstrap` + sweep каждые 30 с): PROCESSING старше 60 с → PENDING, затем обработка всех PENDING штатным диспетчером (сообщение и пользователь загружаются из БД), итог в лог; юнит-тесты: pending-задача обрабатывается, зависший PROCESSING переоткрывается по возрасту, DONE не трогается; проверка: `npx vitest run` в `backend/` — зелёный
- [x] 12.5 Фронтенд: в `ChatService`/`ChatComponent` при переподключении SSE (connected false→true) повторно загрузить историю и обновить список сообщений; юнит-тест в `chat.component.spec.ts`: после переподключения история перезапрошена; проверка: `npm test` в `frontend/` — зелёный
- [x] 12.6 Дополнить `backend/README.md` разделом о надёжности доставки (outbox-таблица `BotPluginTask`, recovery при старте, что происходит с сообщением при рестарте); проверка: раздел соответствует коду
- [x] 12.7 Полный прогон: `npx vitest run`, `npm run test:e2e`, `npm test` (фронт), `ng build` — все зелёные

## Workflow follow-up

- Прогнать прод-проверку deep-links на прод-стеке (`./start-prod.sh`), если она требовалась в предыдущем изменении.
- Архивировать изменение после проверки (workflow `openspec-archive-change`): синхронизировать 4 capability в `openspec/specs/`.
