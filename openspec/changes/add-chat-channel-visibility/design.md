# Design: add-chat-channel-visibility

## Context

Диалог один (`Conversation` → `Message`), но транспортов несколько. Входящие `USER`-сообщения создаются в `ChatService.sendMessage`/`submitButtonCallback` из двух мест: веб-контроллер `ChatController` и Telegram-мост `TelegramBridgeService.handleUpdate` — оба вызывают один и тот же метод, канал не передаётся. `BOT`-сообщения создают `MockBotService.replyAsBot` (консоль оператора, сейчас без личности оператора) и `BotPluginsService.dispatchAndReply` (автоответы; `user` уже в scope). Исходящий мост пересылает все `BOT`-сообщения в Telegram ровно при условиях `user.telegramBotId && user.telegramChatId && bot.isActive` (см. `forwardOutgoing`). Модель `Message` хранит только `senderRole/kind/content/buttons`; DTO и `ChatEvent` канальных полей не имеют. Существующие сообщения останутся без канальных данных.

См. proposal.md (Why) и delta-спеки для требований.

## Goals / Non-Goals

**Goals:**

- Зафиксировать канальный снимок каждого сообщения в момент записи (источник для `USER`, доставка для `BOT`, email оператора для ответов консоли).
- Прокинуть снимок через REST-историю, SSE-события и сводку диалогов (включая генерацию swagger.json и SDK).
- Показать канальные отметки, имена ботов и подписи операторов в `/chat` и `/mock-bot`; визуально различить отправителей/получателей — включая сообщения разных ботов между собой (фон/акцент, а не только текст бейджа).
- Не ломать существующую историю: старые сообщения отображаются без отметок.

**Non-Goals:**

- Не меняем правила доставки/пересылки сообщений (мост, гейт `assertTransportActive`) — только фиксируем факт.
- Не заполняем канальный снимок ретроактивно и не храним `botUsername`/`telegramBotId` на сообщении.
- Не показываем канальную метаинформацию внутри самого Telegram (там рендерит Telegram).
- Не различаем автоответы отдельных плагинов между собой (все — «Бот»).
- Не трогаем фильтрацию `kind=BUTTON` из пользовательской истории/потока.

## Decisions

### D1. Канальный снимок — nullable-поля на `Message`, без FK

Добавляем в Prisma: enum `MessageChannel { WEB, TELEGRAM }` и на `Message` — `channel MessageChannel?`, `botName String?`, `operatorEmail String?`. `null` = сообщение записано до фичи (единственное значение null-семантики, миграция аддитивная).

- **Альтернатива (таблица доставок с FK на TelegramBot)**: отклонена — потребность только отображаемая, снимок обязан быть иммунным к переименованию/удалению бота (прецедент — иммутабельный снимок `buttons`), а каждый Read-путь оброс бы join'ом.
- `botName` — копия `TelegramBot.name` на момент записи, `operatorEmail` — копия `User.email` оператора (снимки, а не ссылки: email/имя могут измениться, история должна остаться правдивой).
- Импорты enum — из `src/generated/prisma/enums.js` (проект на генераторе `prisma-client`, не из `@prisma/client`).

### D2. Семантика канала: USER = источник, BOT = доставка на момент записи

- `USER`: `WEB` — создано веб-контроллером; `TELEGRAM` + имя бота — создано мостом (у моста в `handleUpdate` уже загружена запись бота: добавить `name` в `select`).
- `BOT`: резолвится при создании по тем же условиям, что гейтят `forwardOutgoing`: `telegramBotId && telegramChatId && bot.isActive` → `TELEGRAM` + имя бота, иначе `WEB`/`null`.
- **Альтернатива (подтверждение доставки от моста post-factum)**: отклонена — событие SSE и история читаются раньше, чем мост завершит отправку; потребовались бы повторные события и лишняя запись, а DTO стал бы недетерминированным. Снимок на момент записи консистентен для всех читателей.
- **Альтернатива (одни поля «отправитель» без разделения USER/BOT)**: отклонена — смешала бы «откуда написал» и «куда доставлено»; требование пользователя про ответ — именно «куда пришло».

### D3. Передача источника через параметр сервисов

`ChatService.sendMessage(user, content, source?)` и `ChatService.submitButtonCallback(user, dto, source?)`, где `source = { channel: 'WEB' } | { channel: 'TELEGRAM'; botName: string }` (тип-объединение, экспортируется из chat.service.ts или message-channel.service.ts). Веб-контроллер передаёт `WEB`, мост — `TELEGRAM` с именем бота; вызов без `source` (и путь recovery-sweep) трактуются как `WEB`. Поля проходят через `createMessageWithTask`, `publishEvent` и `ChatEvent` (добавить `channel/botName/operatorEmail` в интерфейс) в оба SSE-потока без изменения правил фильтрации `BUTTON`.

### D4. Резолвер доставки для BOT-сообщений — новый `MessageChannelService`

Новый сервис `backend/src/services/message-channel.service.ts`: метод `resolveDelivery(user)` (принимает `{ telegramBotId, telegramChatId }`) возвращает снимок `{ channel, botName }`; при наличии `telegramBotId` — один запрос к `telegram_bot` (`isActive`, `name`). Регистрация в `app.module.ts` (вручную, как все сервисы проекта). Использование:

- `MockBotService.replyAsBot(userId, content, buttons, operatorEmail)` — контроллер передаёт `requireAuthUser(req).email`; сервис грузит пользователя по `userId` (он и так нужен для upsert-пути) и резолвит доставку.
- `BotPluginsService.dispatchAndReply` — `user` уже в scope, резолв без дополнительных запросов на пользователя; снимок пишется в той же транзакции, что и ответ.

**Альтернатива (логика инлайн в каждом сервисе)**: отклонена — два места должны в точности повторять условия моста; единый резолвер исключает расхождение.

### D5. DTO и контракты

- `ChatMessageDto`, `ChatStreamEventDto`, `MockBotStreamEventDto`: + `channel` (nullable enum-строка), `botName`, `operatorEmail` (nullable) с `@ApiProperty` (`nullable: true`, enum для `channel`) — по конвенции controller-dto-swagger.
- `ConversationSummaryDto`: + `lastMessageChannel` (nullable); `listConversations` берёт канал из уже загруженного последнего сообщения.
- Валидация — в сервисах (глобального ValidationPipe в проекте нет), но новые поля только на выходе, вход не расширяется.
- Перегенерация `swagger.json` и SDK (`generate:openapi-ts`) — e2e ходят через сгенерированный SDK.

### D6. Фронтенд: бейджи, подписи, визуальное различение

- Интерфейсы `ChatMessage`/`ChatStreamEvent` (chat.service.ts), `ConversationMessage`/`MockBotStreamEvent`/`ConversationSummary` (mock-bot.service.ts) зеркалят DTO.
- Канальный бейдж под сообщением: `WEB` → «веб-чат»; `TELEGRAM` → «Telegram · <botName>». В `/chat`: свои сообщения — «отправлено из …», ответы — «доставлено в …»; в `/mock-bot`: входящие — «из …», ответы — «доставлено в …». `channel = null` → бейдж не рендерится.
- Подпись отправителя `BOT`: `operatorEmail` (ответ консоли) иначе «Бот»; в консоли `USER` — «Пользователь».
- Визуальное различение по идентичности, а не по каналу: пузыри уже различаются по `senderRole`; цвет пузыря/акцента детерминированно выводится из идентичности сообщения (хэш строки → hue при фиксированных насыщенности/светлоте), поэтому два разных Telegram-бота различимы визуально, а не только текстом бейджа. Ключ цвета: у `USER` — бот-источник (`botName`; нейтральный при `WEB`); у `BOT` — оператор (`operatorEmail`), иначе бот-получатель (`botName`), иначе нейтральный мок. Мок без идентичности — нейтральный серый; бейдж остаётся текстовым источником точной информации. Палитра и helper вычисления цвета едины для `/chat` и `/mock-bot` (общий утилитный файл, классы-модификаторы вида `msg-identity-<hash>`).
- Кликабельность/поведение существующих элементов не меняются.

### D7. Тестовая стратегия

- Юниты: `chat.service.spec` (параметр `source` в обоих методах и в `ChatEvent`), `mock-bot.service.spec` (operatorEmail + резолв доставки), `telegram-bridge.spec` (мост передаёт `TELEGRAM` + имя бота), новый `message-channel.service.spec` (все ветки условий моста), спеки плагинов (снимок в ответе).
- E2E: `chat.e2e-spec`, `mock-bot`-покрытие, `telegram-binding.e2e-spec` — проверка канальных полей; помнить, что точные `toEqual`-сравнения формы DTO ломаются при добавлении полей — пройтись по всем e2e с точной формой сообщения.
- Фронт: Jest-спеки `chat.component.spec`, `mock-bot.component.spec` — рендер бейджа и подписей; `npm test` из frontend (ng test → @angular-builders/jest).
- e2e-гигиена — по `.agents/skills/e2e-fixture-hygiene` (только test-spawned ключи).

## Risks / Trade-offs

- [Смена цели между записью снимка и фактической пересылкой мостом] → Бейдж одного сообщения может разойтись с фактом доставки. Принято: окно гонки ничтожно, снимок-семантика документирована в спеке («на момент создания»).
- [Email оператора виден пользователю] → Осознанное решение пользователя (выбрано при уточнении). Снимок фиксирует email на момент отправки.
- [Лишний запрос к `telegram_bot` на каждый ответ консоли] → Нагрузка ничтожна; в плагинах запроса нет (user в scope).
- [Точные сравнения формы DTO в e2e/юнитах] → Явный шаг задач: прогнать все точные `toEqual` по сообщению/профилю и обновить.
- [Nullable enum в OpenAPI/SDK] → Явно пометить `nullable: true`; после регенерации SDK проверить типы в e2e-хелперах.

## Migration Plan

1. Миграция Prisma (prisma-migrations-only): `MessageChannel` enum + три nullable-колонки на `messages`; `npx prisma generate`. Аддитивная, бэкпила нет, откат — downgrade миграции.
2. Код бэкенда, DTO, swagger.json + SDK — одним этапом (контракт меняется аддитивно, старые клиенты не ломаются: поля nullable).
3. Фронтенд — после SDK.
4. Роллбэк: код откатывается без последствий; колонки остаются nullable-пустыми.

## Open Questions

(нет — спорные вопросы решены: личность мок-сервера = email оператора-админа, выбрано пользователем.)
