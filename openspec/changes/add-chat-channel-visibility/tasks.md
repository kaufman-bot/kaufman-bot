# Tasks: add-chat-channel-visibility

## 1. Схема данных и миграция Prisma

- [x] 1.1 Добавить в `backend/prisma/schema.prisma` enum `MessageChannel { WEB, TELEGRAM }` и nullable-поля снимка на `Message` (`channel MessageChannel?`, `botName String?`, `operatorEmail String?` с doc-комментариями по конвенции файла); создать миграцию и применить её (skill prisma-migrations-only), выполнить `npx prisma generate` из `backend/`. Проверка: миграция применена, клиент сгенерирован, `npm run build` (или `tsc --noEmit`) бэкенда зелёный, fixture-спеки (chat.service.spec `makeUser`) не сломаны.

## 2. Backend: канальный снимок входящих сообщений и контракт API

- [x] 2.1 Ввести тип источника `{ channel: 'WEB' } | { channel: 'TELEGRAM'; botName: string }`; добавить параметр `source?` в `ChatService.sendMessage` и `submitButtonCallback` (веб-контроллер передаёт `WEB`, вызов без source — `WEB`); расширить `ChatEvent` и `publishEvent`/`toStreamEvent` полями `channel/botName/operatorEmail`; дополнить `TelegramBridgeService` (передача `TELEGRAM` + имени бота из загруженной записи в `handleMessage`/`handleCallbackQuery`, добавив `name` в `select`). Обновить юнит-тесты `chat.service.spec.ts` и `telegram-bridge.service.spec.ts` (ветки: веб, телеграм с именем бота, дефолт). Проверка: юниты бэкенда зелёные.
- [x] 2.2 Расширить DTO по конвенции controller-dto-swagger: `ChatMessageDto`, `ChatStreamEventDto`, `MockBotStreamEventDto` (+ `channel` nullable enum, `botName`, `operatorEmail`), `ConversationSummaryDto` (+ `lastMessageChannel`); прокинуть поля через `MockBotService.getConversationMessages`/`listConversations` (из уже читаемых строк) и SSE-маппинг консоли; перегенерировать `swagger.json` и SDK (`generate:openapi-ts`). Проверка: swagger содержит новые nullable-поля, типы SDK обновлены, юниты `mock-bot.service.spec.ts` зелёные.

## 3. Backend: канальный снимок ответов бота (консоль и плагины)

- [x] 3.1 Создать `backend/src/services/message-channel.service.ts` (`resolveDelivery(user)` по условиям моста `telegramBotId && telegramChatId && bot.isActive`, снимок `{ channel, botName }`), зарегистрировать в `app.module.ts`; написать `message-channel.service.spec.ts` на все ветки. Использовать резолвер в `MockBotService.replyAsBot` (новый параметр `operatorEmail` из `requireAuthUser(req).email` в контроллере; снимок в той же записи сообщения) и в `BotPluginsService.dispatchAndReply` (user в scope; снимок в транзакции с ответом, `operatorEmail = null`). Проверка: юниты message-channel/mock-bot/bot-plugins зелёные, `tsc --noEmit` чистый.
- [x] 3.2 Обновить e2e-покрытие бэкенда под новый контракт: пройтись по всем точным `toEqual`-сравнениям сообщений/профиля (chat, mock-bot, telegram-binding, plugins, settings-plugin — по факту падений), добавить проверки канальных полей (ответ консоли несёт `operatorEmail` и `channel = WEB` для мок-цели; входящее из веба — `channel = WEB`; автоответ плагина — `operatorEmail = null`) с соблюдением e2e-fixture-hygiene (только test-spawned ключи). Проверка: `npm test` бэкенда и полный e2e-прогон зелёные.

## 4. Frontend: чат пользователя `/chat`

- [x] 4.1 Зеркалировать канальные поля в интерфейсах `chat.service.ts`; на странице `/chat` добавить канальный бейдж под сообщением («отправлено из веб-чата/Telegram · имя» для своих, «доставлено в веб-чат/Telegram · имя» для ответов), подпись отправителя `BOT` (email оператора либо «Бот»), визуальное различение по идентичности — детерминированный оттенок на конкретного бота/оператора/мок через общий helper цвета, единый с консолью (сообщения разных ботов различимы между собой, а не только текстом бейджа), сообщения с `channel = null` — без бейджа. Обновить Jest-спеки компонента (рендер бейджа, подписи оператора, разные цвета у сообщений разных ботов, legacy-сообщение). Проверка: `npm test` фронтенда зелёный, `ng build` проходит.

## 5. Frontend: консоль оператора `/mock-bot`

- [x] 5.1 Зеркалировать канальные поля в интерфейсах `mock-bot.service.ts`; в консоли показать: у сообщений пользователя бейдж источника («из веб-чата» / «из Telegram · имя», включая нажатия кнопок), у ответов — подпись оператора/«Бот» и бейдж доставки; в списке диалогов — отметку канала у превью последнего сообщения; визуальное различение по идентичности (общий helper цвета из задачи 4 — сообщения и ответы, прошедшие разными ботами, получают разные цвета). Обновить Jest-спеки компонента и сервиса (включая разные цвета у разных ботов). Проверка: `npm test` фронтенда зелёный, `ng build` проходит.

## 6. Сквозная верификация и документация

- [x] 6.1 Прогнать полный набор: юниты бэкенда, e2e бэкенда, Jest фронтенда, сборка фронтенда; вручную проверить сценарий спек на живом стенде (веб-сообщение → `WEB` в консоли; ответ консоли → подпись оператора и бейдж доставки в `/chat`; при привязке — `TELEGRAM` + имя бота). Проверка: все команды зелёные, поведение соответствует delta-спекам.
- [x] 6.2 Обновить документацию по readme-auto-update: `backend/README.md` (канальный снимок сообщения, поля DTO), `frontend/README.md` (бейджи/визуальное различение), `docs/architecture.md` (семантика канала USER=источник / BOT=доставка, резолвер). Проверка: разделы описывают фактическое поведение, соответствуют коду.

## Workflow follow-up

- После прохождения ревью — архивация change (`/opsx:archive`) с синхронизацией delta-спек в main specs.
