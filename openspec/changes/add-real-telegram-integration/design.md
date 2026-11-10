# Design

## Context

Мотивация и требования — в `proposal.md` и `specs/*`. Подход определяют эти факты текущего состояния:

- Единственный Nest-модуль — `AppModule` (`backend/src/app.module.ts`); новый сервис/контроллер = провайдер/строка в `providers[]`/`controllers[]`, отдельных `@Module` не заводим.
- Ядро разговора: `ChatService.sendMessage`/`submitButtonCallback` пишут `Message(USER)` + `BotPluginTask` одной транзакцией (`createMessageWithTask`), затем `dispatchToPlugins` → `BotPluginsService.dispatchAndReply` создаёт `Message(BOT)` и публикует `ChatEvent`. Консоль оператора `MockBotService.replyAsBot` пишет `Message(BOT)` и публикует тот же `ChatEvent`.
- `ChatEventsService` — in-memory RxJS `Subject<ChatEvent>` (`{conversationId, messageId, senderRole, content, kind, buttons}`); его слушают SSE пользователя и SSE консоли. Доставка не переживает рестарт и не кросс-инстансная (см. BACKLOG #2).
- `Message.buttons` — снимок `[{ title, callbackData }]`; валидация/нормализация в `utils/keyboard-buttons.ts` (`validateButtons`/`normalizeButtons`/`toButtons`), лимиты 12 / 64 / 256.
- У каждого пользователя ровно один `Conversation` (1:1). Роли `USER`/`ADMIN` (`Role`), админ-эндпоинты под `AdminGuard` вторым гардом. Owner-scope-паттерн — `ButtonPreset.ownerId`.
- Bootstrap: `setGlobalPrefix('api')` + URI-версионирование `v1`; `VERSION_NEUTRAL` для неверсируемых маршрутов. Глобального `ValidationPipe` нет — вся валидация в сервисах (`BadRequestException`/`NotFoundException`/`ConflictException`).
- Env грузится через `node --env-file` (решение `decisions.md#node---env-file`); `PrismaService` читает `DATABASE_URL` в конструкторе. `OnApplicationBootstrap` уже используется `SeedService` и `BotPluginsService`.
- Prod-раздача: `ServeStaticModule` исключает `/api/{*path}`, поэтому публичные маршруты под `/api` не перехватываются статикой.
- Telegram-интеграции в коде нет; все предыдущие изменения явно оставляли её за рамками.

## Goals / Non-Goals

**Goals:**

- Telegram — транспортный адаптер поверх существующего движка разговора; плагины и консоль не переписываются.
- Несколько боевых ботов на админа (owner-scope), каждый со своим токеном, настройками, флагом активности и собственным вебхуком с секретом.
- Самостоятельная регистрация вебхуков включённых ботов при старте — best-effort, не ломает запуск.
- Сквозной мост: входящие текст/нажатие из Telegram идут тем же путём, что ввод в веб-чате; любой `BOT`-ответ привязанному и включённому пользователю уходит в Telegram (текст + inline-клавиатура).
- Понятная ошибка веб-отправки, когда привязанный бот выключен; мгновенная остановка моста при возврате на мок-сервер.

**Non-Goals:**

- Медиа/фото и их кэпшены, исходящие инициативные рассылки, обработка `my_chat_member`/`edited_message`/`inline_query`.
- Polling как основной канал (вебхуки первичны; polling — задел в BACKLOG).
- Redis/distributed-блокировки: дедупликация доставки в cluster остаётся долгом BACKLOG #1/#2.
- i18n строк моста и шифрование токенов at-rest.

## Decisions

### D1. grammY как клиент Bot API; Nest владеет HTTP-роутингом вебхука

`npm i grammy` в `backend`. Для каждого активного `TelegramBot` создаётся экземпляр `Bot` из токена. Мы **не** запускаем собственный HTTP-слушатель grammY: Nest-контроллер `TelegramWebhookController` принимает `Update` и вызывает `bot.handleUpdate(update, secretToken)`; исходящие идут через `bot.api.sendMessage` / `answerCallbackQuery` / `setWebhook` / `deleteWebhook`. Инстансы `Bot` живут в реестре `TelegramBridgeService`, пересоздаются при изменении токена.

- Альтернатива — отдельный порт/express-слушатель grammY: ломает однопортовую prod-топологию (`ServeStatic`) и обходит глобальный префикс/versioning. Отклонено.
- Альтернатива — Telegraf: в запросе явно указан grammy.dev. Отклонено.
- Альтернатива — `@nestjs-modules/telegram`: тянет свой модуль (нарушает «один AppModule») и ориентирован на polling. Отклонено.
- Граница тестируемости: `TelegramBridgeService` зависит от узкого интерфейса `TelegramSender` (`sendMessage(chatId, text, buttons?)`, `answerCallbackQuery(id)`), grammy-реализация подставляется в проде; в юнитах — мок.

### D2. Публичный маршрут вебхука: version-neutral, путь по id бота, секрет в заголовке

Контроллер `@Controller({ path: 'telegram/webhook', version: VERSION_NEUTRAL })`, без `ApiKeyGuard` (его зовёт Telegram, не наши пользователи). Путь `POST /api/telegram/webhook/:botId` маршрутизирует к нужному боту; подлинность проверяется секретом бота из заголовка `X-Telegram-Bot-Api-Secret-Token` (сверяется с `TelegramBot.webhookSecret`). `VERSION_NEUTRAL` выбран, чтобы публичный URL не менялся при росте версии API — иначе сохранённые в Telegram регистрации вебхуков «отвалились» бы.

- Альтернатива — держать под `v1`: стабильность URL теряется при версионировании. Отклонено.
- Альтернатива — секрет в пути (`/webhook/:secret`): тоже работает, но path-секреты оседают в логах/истории URL; header-секрет — рекомендованный Telegram способ. Выбор: id в пути + секрет в заголовке.

### D3. Модель данных

```prisma
model TelegramBot {
  id          String  @id @default(cuid())
  ownerId     String
  owner       User    @relation("BotOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  name        String
  botToken    String            // токен Bot API (секрет; в DTO маскируется)
  botUsername String?           // для deep-link t.me/<username>
  isActive    Boolean @default(true)
  webhookSecret String @default(cuid()) // генерируется при создании
  settings    Json?             // «разные настройки» — произвольный объект
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  users       User[]            // пользователи, у которых этот бот активен
  @@index([ownerId])
  @@map("telegram_bots")
}

model User {
  ...
  telegramBotId  String?        // null → мок-сервер; иначе активный бот
  telegramBot    TelegramBot? @relation(fields: [telegramBotId], references: [id], onDelete: SetNull)
  telegramChatId String?        // привязанный Telegram chat id (null до запуска/привязки)
}

model TelegramBindingToken {
  id            String   @id @default(cuid())
  token         String   @unique  // крипто-случайный, одноразовый
  userId        String
  telegramBotId String
  expiresAt     DateTime
  usedAt        DateTime?
  createdAt     DateTime @default(now())
  @@index([userId])
  @@map("telegram_binding_tokens")
}
```

- **Активная цель** = `telegramBotId`: `null` → мок-сервер (значение по умолчанию, прежнее поведение), иначе — этот бот. Один источник правды; проверка «включён ли бот» читается из `telegramBot.isActive`.
- `telegramChatId` значим только при непустом `telegramBotId`; при смене цели сервис обнуляет его (см. D5). `onDelete: SetNull` на `telegramBotId` — при удалении бота пользователи автоматически откатываются на мок-сервер (безопасно).
- `webhookSecret` — непрозрачный секрет на бота, используется и в `setWebhook(secret_token)`, и в проверке заголовка.
- Одноразовый токен привязки хранится в БД (создаётся при «запуске», расходуется на `/start`). Альтернатива — stateless HMAC-подпись `{userId,botId}`: нет отзыва/срока без ключевой инфраструктуры и сложнее тесты. Отклонено.
- `settings Json?` — абстракция «разных настроек» сейчас; конкретные поля заводятся отдельными изменениями (Open Question). Enum Prisma/типы импортируются из `src/generated/prisma` (не из `@prisma/client`).

### D4. Ворота транспорта в `ChatService` (минимальная правка ядра)

В начале `sendMessage`/`submitButtonCallback` резолвится активная цель: если `user.telegramBotId != null` и соответствующий бот `isActive === false` → `ConflictException(409, "<понятный текст>")`, сообщение НЕ пишется и НЕ диспатчится. Если цель — мок ИЛИ бот включён → путь без изменений. Это единственная правка ядра под требования; исходящее дублирование в Telegram инвариантно каналу входа и обрабатывается подписчиком моста (D5), поэтому `sendMessage` не «знает» о Telegram.

### D5. Мост = подписчик `ChatEventsService` + обработчик входящих вебхуков

`TelegramBridgeService` (инфра-сервис) в `OnApplicationBootstrap`:

1. **Исходящие**: подписывается на `chatEvents.streamAll()`, берёт `senderRole==='BOT'`, резолвит `conversation → user`, шлёт в Telegram, только если `user.telegramBotId != null` **и** бот `isActive` **и** `user.telegramChatId` непуст. Текст + кнопки маппятся в `InlineKeyboardMarkup`.
2. **Входящие**: `TelegramWebhookController` → `handleUpdate(botId, update, secret)`:
   - `message.text` вида `/start <token>` → расходует `TelegramBindingToken` → ставит `user.telegramChatId` (+ подтверждение в чат).
   - текстовое сообщение от привязанного `chatId` → вызывает тот же внутренний путь приёма, что `ChatService.sendMessage` для этого пользователя (создание `Message(USER)`+task+`dispatchToPlugins`); ответ бота придёт по подписке (п.1).
   - `callback_query` от привязанного `chatId` → путь `submitButtonCallback` + `answerCallbackQuery`; ответ плагина уходит по подписке.
   - обновление от непривязанного `chatId`/выключенного бота → игнор (без записи в чужой диалог).

- При переключении на мок/смене бота `TelegramBindingService` обнуляет `telegramChatId`, и п.1 перестает матчить этого пользователя — мост гаснет мгновенно без явного unbind.
- **Макет клавиатуры**: плоский массив `buttons` раскладывается по одной кнопке на ряд (безопасно по лимитам Telegram). **Длина `callback_data`**: наш лимит 256 против лимита Telegram 64 — кнопки с `callbackData` >64 байт в Telegram-разметку не кладутся (сообщение уходит текстом или с обрезанным набором), чтобы `sendMessage` не упал с 400.
- **Кластер**: in-memory шина может породить дубль исходящего в Telegram при >1 воркере — тот же класс, что BACKLOG #2; в этом изменении `ecosystem-prod.config.cjs` остаётся `instances: 1`, дедуп по Redis — долг.

### D6. Жизненный цикл вебхуков (`TelegramWebhookService`, best-effort)

Отдельный инфраструктурный сервис держит регистрацию вебхуков, чтобы CRUD-сервис остался чистым (service-layer-split):

- `OnApplicationBootstrap`: для всех `isActive` ботов — попытка `setWebhook({ url: `${TELEGRAM_WEBHOOK_BASE_URL}/api/telegram/webhook/${id}`, secret_token })`.
- Реакция на админ-действия: create/enable → set; disable/update(token) → set; delete → `deleteWebhook` (для привязанных — без удаления вебхука других ботов).
- Любой вызов в `try/catch` + `Logger.error`; при пустом `TELEGRAM_WEBHOOK_BASE_URL` — warn и пропуск. Ничего не бросается в старт/запрос. Боты с фейковым токеном (dev/тесты) просто логируют ошибку Telegram.

### D7. Границы сервисов (service-layer-split)

- `TelegramBotsService` — entity-CRUD над `TelegramBot`, owner-scope (`ownerId` из вошедшего админа), маскирование `botToken` в DTO; toggle = обычный update `isActive`.
- `TelegramBindingService` — use-case: назначение цели админом (+ сброс `telegramChatId`), выдача `TelegramBindingToken` и deep-link при «запуске», расходование токена на `/start`, отклонение назначения чужого/несуществующего бота.
- `TelegramBridgeService` — инфраструктурный мост (D5). `TelegramWebhookService` — инфраструктурная регистрация вебхуков (D6).
- Контроллеры: `TelegramBotsController` (`telegram/bots`, `ApiKeyGuard+AdminGuard`), расширение админ-назначения (`PUT /admin/users/:id/telegram-target`), `TelegramLaunchController` (`POST /telegram/launch`, `ApiKeyGuard`) и публичный `TelegramWebhookController` (D2). Регистрация — только в `app.module.ts`.

### D8. DTO + Swagger (controller-dto-swagger)

DTO-классы с `@ApiProperty`; в ответе `botToken` — только маскированное значение, `webhookSecret` не отдаётся. `@ApiHeader({ required: false })` на guard-эндпоинтах (SDK-совместимость). Публичный вебхука-контроллер без канал-аннотаций ключа. Валидация входов — в сервисах (нет глобального pipe). После новых эндпоинтов — `generate:openapi-ts`.

### D9. Тестовая стратегия

- Юнит (vitest): `TelegramBotsService` (owner-scope, маскирование, toggle, 404 на чужом); `TelegramBindingService` (назначение/сброс `telegramChatId`, выдача и расходование токена, отказ чужому боту, 401/403 — на уровне гардов в e2e); `TelegramBridgeService` (входящий текст→путь sendMessage, callback→submitButtonCallback+answer, исходящий forward только при включённом+привязанном, маппинг кнопок и отбраковка `callback_data`>64, игнор непривязанных); `chat.service.spec` (409 при выключенном боте; успех при включённом и при моке). Грамми мокается через интерфейс `TelegramSender`, `PrismaService`/шина — моки.
- E2E (SDK на живом бэкенде, e2e-fixture-hygiene — test-spawned ADMIN-ключ, сид-ключ только для register/teardown): CRUD ботов (owner-scope, маскирование, 403/401), назначение цели пользователю, `POST /telegram/launch` возвращает url+token, веб-отправка даёт `409` при выключенном боте и `201` при включённом/моке. Реальный Telegram не вызывается (внешняя граница: регистрация вебхуков best-effort логирует ошибку фейкового токена; forward-логика покрыта юнитами).
- Фронтенд: `navbar.component.spec` — кнопка «Запустить телеграм бота» видна при цели-боте и скрыта при моке; моки профиля/сервиса.

## Risks / Trade-offs

- [`callback_data` до 256 у нас против 64 байт у Telegram] → такие кнопки не кладутся в inline-разметку (текстовый фолбэк), чтобы `sendMessage` не получил 400; долг по унификации лимита в BACKLOG.
- [Дубль исходящего в Telegram при cluster (>1 воркер)] → держим `instances: 1`; дедуп по Redis = BACKLOG #2.
- [нет публичного HTTPS в dev → вебхук не зарегистрируется] → best-effort warn; логика моста проверяется юнитами, не живым Telegram.
- [токены ботов хранятся в БД открыто] → маскирование на чтении, `webhookSecret` не отдаётся; шифрование at-rest вне рамок (риск).
- [подделка обновлений на адрес вебхука] → проверка header-секрета + обработка только привязанных `chatId`; непрошедшие проверки — тихий отклон.
- [медленный/недоступный Telegram замедляет старт] → регистрация non-blocking (`void` + короткая задержка между ботами), ошибки только логируются.
- [входящий из Telegram проходит тот же outbox, что и веб] → переиспользует проверенный exactly-once-путь; риск двойного reply исключён захватом задачи (`dispatchAndReply`), как в вебе.

## Migration Plan

1. `backend/prisma/schema.prisma` → `npx prisma migrate dev --name add_telegram_bots` → `npx prisma generate`.
2. `backend`: `npm i grammy`; новые сервисы/контроллеры + регистрация в `app.module.ts`.
3. `backend/.env.example` и `docs/environment.md`: `TELEGRAM_WEBHOOK_BASE_URL` (публичный HTTPS-origin, куда Telegram ходит на `/api/telegram/webhook/*`).
4. Бэкенд: CRUD/DTO → binding → bridge → webhook-setup → гейт в `ChatService`.
5. `npm run start:dev` → `npm run generate:openapi-ts` → `npm run test` → `npm run test:e2e` (регрессия `chat`, `settings-plugin`, `keyboard-buttons` не деградируют).
6. Фронтенд: navbar-кнопка + сервис запуска/привязки + админ-экран ботов/назначения.
7. Прод: `prisma migrate deploy` → рестарт; боты без валидного токена/публичного URL лишь залогирят пропуск регистрации.
8. Откат: реверт кода + `prisma migrate`-откат (drop новых таблиц); `telegramBotId`/`telegramChatId` снимутся миграцией отката, пользователи — на мок-сервере.

## Open Questions

- Точный набор полей `TelegramBot.settings` — сейчас общий `Json`; конкретные настройки заводятся отдельными изменениями.
- Доставка исходящего как новое сообщение vs редактирование прежней клавиатуры — сейчас новое сообщение; редактирование — позже.
- Поведение при «пользователь написал боту в Telegram до того, как его привязали» — сейчас игнор; подсказка «нажмите запуск» — отдельным изменением.
