# Design

## Context

См. proposal.md (Why). Текущее состояние, определяющее подход:

- `ChatService.sendMessage` сохраняет сообщение `USER`, публикует событие в шину `ChatEventsService` и возвращает DTO; автоответов нет — ответ бота появляется только через `MockBotService.replyAsBot` (консоль оператора), который уже реализует паттерн «сохранить `BOT`-сообщение + опубликовать событие».
- Профиль пользователя собирает `AuthService.profile` (`GET /auth/me`); эндпоинта самообновления профиля нет, `UsersService` — только админский CRUD. Глобального `ValidationPipe` в `main.ts` нет — валидация запросов выполняется в сервисах через `BadRequestException`.
- Контроллеры принимают/возвращают только DTO-классы со Swagger-декораторами; вложенные DTO — через `@ApiProperty({ type })`. Все сервисы и контроллеры регистрируются вручную в `AppModule` (модулей-фич в проекте нет, кроме `PrismaModule`/`SeedModule`).
- Схема БД меняется только миграциями Prisma; enum/типы импортируются из `src/generated/prisma`, клиент — `.ts`-вывод генератора `prisma-client`.
- E2e идут через SDK (`@hey-api/openapi-ts`) на живом бэкенде; после изменения контракта — `start:dev` → `generate:openapi-ts` → `test:e2e`.

## Goals / Non-Goals

**Goals:**

- Контракт плагина: один интерфейс + один токен провайдера (multi-provider); ядро чата не знает конкретных плагинов.
- Два плагина (`ping`→`pong`, `time`→время сервера в таймзоне) как самостоятельные сервисы.
- Доставка ответа плагина тем же механизмом, что и ответы оператора (БД + SSE), без новых эндпоинтов чата.
- Хранение таймзоны пользователя и её самостоятельное обновление владельцем ключа.
- Изоляция ошибок: плагин не может сломать отправку сообщения пользователя.

**Non-Goals:**

- Динамическая загрузка плагинов из пакетов/файлов, конфигурация плагинов через env/БД — плагины регистрируются в коде.
- Управление плагинами через API (включение/выключение), метрики плагинов.
- Ответы несколькими плагинами на одно сообщение, chaining ответов.
- Telegram-интеграция; реакция плагинов на сообщения оператора.

## Decisions

### D1. Контракт плагина и регистрация — NestJS multi-provider по токену

В `backend/src/plugins/` создаётся подсистема: `bot-plugin.interface.ts` с интерфейсом

```ts
export const BOT_PLUGINS = Symbol('BOT_PLUGINS');

export interface BotPluginContext {
  user: User; // пользователь-отправитель (с user.timezone)
  content: string; // текст сообщения после trim
}

export interface BotPlugin {
  readonly name: string;
  canHandle(content: string): boolean;
  handle(context: BotPluginContext): Promise<string> | string;
}
```

Регистрация в `AppModule.providers`:

```ts
PingPongPlugin,
TimePlugin,
{ provide: BOT_PLUGINS, useClass: PingPongPlugin },
{ provide: BOT_PLUGINS, useClass: TimePlugin },
BotPluginsService, // диспетчер, @Inject(BOT_PLUGINS) plugins: BotPlugin[]
```

`useClass`-multi-provider — канонический способ NestJS собрать массив реализаций под одним токеном; порядок в массиве = порядок объявления (детерминированный приоритет «первый сработавший»).

_Альтернативы:_ `useFactory`, вручную собирающий массив из инжектируемых сервисов — двойная регистрация, легко рассинхронизировать; `@nestjs/event-emitter` (on/emit) — слабая типизация, не даёт приоритета и одиночного ответа; динамический скан директории — против конвенций проекта (всё регистрируется явно в `AppModule`).

### D2. Диспетчер — `BotPluginsService` в `backend/src/plugins/`

`BotPluginsService.dispatchAndReply(conversationId, user, content)`:

1. находит первый плагин с `canHandle(content)`; если нет — выходит (void);
2. вызывает `handle({ user, content })`, получает текст ответа;
3. сохраняет `BOT`-сообщение в диалог и публикует `ChatEvent` через `PrismaService` + `ChatEventsService` (тот же паттерн, что в `MockBotService.replyAsBot`).

Вызов встраивается в конец `ChatService.sendMessage` и **ожидается** (`await`) до возврата HTTP-ответа, обёрнут в `try/catch` с `Logger.error`: успех диспетчера делает поведение детерминированным для e2e (после `POST /chat/messages` история и SSE гарантированно содержат ответ), ошибка плагина не влияет на ответ `201`.

_Альтернативы:_ fire-and-forget без await — гонка «POST вернулся, а ответа ещё нет» сделает e2e и SSE-логику нестабильными; диспетчер, переиспользующий `MockBotService.replyAsBot(userId, content)` — связывает ядро плагинов с консолью оператора; вынос общего «отправить сообщение бота» в отдельный сервис — правильнее долгосрочно, но при двух использованиях это преждевременный рефакторинг (зафиксировано как технический долг, см. Risks).

### D3. Формат ответа time-плагина

Текст вида `2026-11-01 12:34:56 (Europe/Moscow)`: фиксированный машиночитаемый порядок (дата, время с секундами, таймзона), собирается из `Intl.DateTimeFormat` c `timeZone` (дата `en-CA` → `YYYY-MM-DD`, время `en-GB`, `hourCycle: 'h23'`). При `user.timezone === null` — формат в `UTC` с пометкой `(UTC)`.

_Альтернатива:_ `toLocaleString('ru-RU')` — локале-зависимый порядок компонентов, труднее валидировать в тестах; чистый ISO-8601 — плохо читается в чате.

### D4. Таймзона пользователя — миграция + `PATCH /api/v1/auth/me`

- Миграция `add_timezone_to_users` из `backend/`: `timezone String?` в модели `User` (nullable — существующие записи и сиды совместимы без бэктраста), затем `prisma generate`.
- `AuthProfileUserDto` дополняется полем `timezone: string | null` (`@ApiProperty({ nullable: true, type: String })` — обязательность в SDK наследуется от аннотаций, поле опциональное); `AuthService.profile` отдаёт `user.timezone`.
- Новый метод `AuthService.updateProfile(user, dto)`: если `timezone` присутствует в теле и не `null` — trim, проверка IANA (`new Intl.DateTimeFormat('en-US', { timeZone: value })` в `try/catch`, иначе `BadRequestException('timezone must be a valid IANA time zone')`), `prisma.user.update`; ответ — существующий `AuthProfileDto`.
- Контроллер: `@Patch('me')` в `AuthController` c `@UseGuards(ApiKeyGuard)`, DTO `UpdateProfileRequestDto`, Swagger-декораторы по паттерну `GET /auth/me` (`@ApiHeader` x-api-key `required: false`, `@ApiQuery apiKey` `required: false`, `@ApiOkResponse({ type: AuthProfileDto })`, `@ApiBadRequestResponse`/`@ApiUnauthorizedResponse` c `ApiErrorDto`). Валидация выполняется в сервисе, не декораторами — глобального `ValidationPipe` в проекте нет.

_Альтернативы:_ `PATCH /admin/users/:id` — это админский CRUD, самообслуживание там чужое; отдельный `ProfileController` — избыточно, профиль уже принадлежит домену auth; передавать таймзону в `POST /auth/login` — расширяет контракт входа и ломает «login ничего не пишет в профиль».

### D5. Синхронизация таймзоны на фронтенде — в `SessionService`

`SessionService.syncTimezone()`: браузерная таймзона через `Intl.DateTimeFormat().resolvedOptions().timeZone`; вызывается после успешного `login()` и после восстановления сессии (валидация через `/auth/me`); PATCH отправляется только при расхождении с `profile.user.timezone`; сигналы профиля обновляются ответом; ошибки глотаются (`catchError`), сессию не рвут. Обращения к API — только в браузере (проверка `isPlatformBrowser`, SSR включён). Отдельный UI-настройки таймзоны не делается: значение заполняется автоматически.

_Альтернатива:_ синхронизация при открытии страницы чата — при узком месте срабатывания (только чат) синхронизация чаще, а эффект тот же.

### D6. Тестирование по конвенциям проекта

- **Юнит (Vitest):** `ping-pong.plugin.spec.ts` / `time.plugin.spec.ts` (фиксированное `Date`/фейковый таймер); `bot-plugins.service.spec.ts` (моки `PrismaService`/`ChatEventsService`: первый сработавший, отсутствие матча, проглатывание ошибки); `chat.service.spec.ts` (диспетчер вызывается после сохранения, ошибка диспетчера не роняет `sendMessage`); `auth.service.spec.ts` (+updateProfile: валидная/невалидная/`null` таймзона).
- **E2E (SDK, живой бэкенд):** сценарии в `backend/test/` (новый `plugins.e2e-spec.ts` + дополнение `auth.e2e-spec.ts`): `ping`/`PING` → `pong` (SSE + история), `ping pong` → ответа нет, `time` → regex формата и корректное смещение после `PATCH /auth/me` (`Europe/Moscow`), `PATCH /auth/me` 200/400/401/очистка, профиль содержит `timezone`. Порядок: `start:dev` → `generate:openapi-ts` → `test:e2e`.
- **Фронт (Jest):** `session.service.spec.ts` — syncTimezone вызывает PATCH только при расхождении, ошибка не роняет сессию.
- При изменении контракта ответа — синхронное обновление типов/тестов фронта.

## Risks / Trade-offs

- [Дублирование кода «сохранить BOT-сообщение + publish» в `BotPluginsService` и `MockBotService`] → осознанный долг при двух использованиях; вынести общий сервис в отдельном изменении, когда появятся третье место или расхождение.
- [Некорректная строка таймзоны, сохранённая в обход API (сид, ручная правка БД)] → `Intl.DateTimeFormat` в time-плагине бросит ошибку; диспетчер её проглотит (ответа не будет), что соответствует контракту изоляции ошибок; санитайз при чтении не нужен.
- [Зависимость от full-ICU для валидации IANA] → Node 18+ собран с full-icu по умолчанию (проект на Node 22/24, см. `.nvmrc`); риск неактуален для целевых сред.
- [Ретрай клиента `POST /chat/messages` при таймауте даст два сообщения и два автоответа] → согласованное поведение (каждое сообщение обрабатывается одинаково); с await-диспетчером ретраи маловероятны.
- [Порядок плагинов неявно задаётся порядком в массиве `providers`] → задокументировано в интерфейсном файле; при конфликте условий приоритет очевиден из кода `AppModule`.
- [`AppModule` — маленький diff, легко потерять при дроблении коммитов] → в задачах зафиксирован отдельный шаг регистрации всех новых провайдеров (включая оба `{ provide: BOT_PLUGINS, ... }`) и проверка `tsc`/тестов после него.

## Migration Plan

1. `backend/`: `npx prisma migrate dev --name add_timezone_to_users` + `npx prisma generate` — аддитивная nullable-колонка, применяемая в дев среде до кода.
2. Код бэкенда (контракт плагина, плагины, диспетчер, `ChatService`, `AuthService`, `AuthController`, DTO) и фронтенда (`SessionService`).
3. Перегенерация `swagger.json` и SDK, прогон юнит/e2e/Jest, `ng build`.
4. Прод: `prisma migrate deploy` перед старом новой версии; откат кода безопасен без отката БД (колонка nullable и не читается старым кодом).

## Open Questions

Нет: спорные вопросы (источник таймзоны — БД, семантика матчинга, одиночный ответ) закрыты в proposal (допущения) и в D1–D6.
