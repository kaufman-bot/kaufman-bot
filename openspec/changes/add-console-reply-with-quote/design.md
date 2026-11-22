# Design

## Context

Сообщение `Message` уже хранит неизменяемые снимки (buttons, channel, botName, operatorEmail), а доставка BOT-ответов идёт через событие `ChatEvent` в `ChatEventsService` → SSE-потоки и `TelegramBridgeService.forwardOutgoing` (гейт: `telegramBotId` + `telegramChatId` + бот активен). Снимок каналаBOT-ответа снимает `MessageChannelService.resolveDelivery` — тот же гейт, что у моста. У входящих Telegram-сообщений снимок `message_id` сейчас не сохраняется, поэтому ссылаться на конкретное Telegram-сообщение при ответе невозможно. Глобального ValidationPipe нет — валидация выполняется в сервисах.

## Goals / Non-Goals

**Goals:**

- Связать ответ оператора с сообщением пользователя (ссылка + снимок цитаты в DTO).
- Единая маршрутизация Telegram-доставки всех ответов бота (оператор с цитатой/без, плагины) по каналу сообщения-контекста: цель цитаты / последнее сообщение пользователя / триггер плагина; гейт активной привязки сохраняется; `reply_to_message_id` для Telegram-целей.
- Явная пометка двойной доставки (`deliveredTo`) в DTO и визуальные пометки в консоли и чате пользователя.
- Сохранять `telegramMessageId` входящих Telegram-сообщений.

**Non-Goals:**

- Редактирование/удаление сообщений, треды (цепочки ответов на ответы), ответы на сообщения бота.
- Изменение веб-доставки: она остаётся безусловной для всех ответов бота.
- Ретроспективное восстановление `message_id` для записей до этого изменения.

## Decisions

**D1. Ссылка, а не денормализованная копия цитаты.**
`Message.replyToId String?` — self-relation (опциональная) на `Message`; снимок `{id, senderRole, content}` собирается join'ом при чтении (include `replyTo`) или из уже загруженного сообщения при отправке. Альтернатива — денормализованные колонки-копии (в духе снимка кнопок) — отклонена: сообщения в системе не удаляются и не редактируются, ссылка не может «протухнуть», дублирование текста усложняет схему. Удаление сообщения-цели (если появится в будущем) занулит ссылку (`SetNull`) — цитата исчезнет, ответ останется.
Плюс `Message.telegramMessageId Int?` — снимок Telegram `message_id` входящих сообщений (null для WEB и legacy). Обе колонки nullable, миграция только добавляет колонки и индекс не требуется (поиск по `id`).
Применяется навык prisma-migrations-only: правка `schema.prisma` → `npm run prisma:create -- add_message_reply_and_telegram_message_id` → `npm run generate` (enum/типы из `src/generated/prisma`, не из `@prisma/client`).

**D2. Событие несёт полный снимок цели, DTO — пользовательский поднабор.**
`ChatEvent.replyTo?: { id; senderRole; content; channel: 'WEB'|'TELEGRAM'|null; telegramMessageId: number | null } | null`. Отправитель события (`MockBotService.replyAsBot`) уже загрузил сообщение-цель для валидации — снимок достаётся бесплатно, мосту не нужен лишний запрос к БД. Наружу (REST и SSE) уходит `MessageQuoteDto { id; senderRole; content }` — вложенный DTO-класс с `@ApiProperty` и `@ApiExtraModels` (навык controller-dto-swagger). `ChatEvent.replyToMessageId` как голый id (вариант «мост сам читает цель из БД») отклонён: лишний запрос в горячем пути пересылки и рассинхронизация решений «снимок канала» vs «фактическая пересылка».

**D3. Решение о доставке — по контексту диалога в сервисе-отправителе, исполнение — в мосте.**
Контекстный канал BOT-ответа — канал сообщения, на которое он отвечает:

1. цитатный ответ оператора — `replyTo.channel`;
2. ответ плагина — канал сообщения-триггера: `ChatService` передаёт снимок канала созданного им сообщения в `dispatchToPlugins`, и тот доходит до `BotPluginsService`;
3. обычный ответ оператора — канал последнего сообщения пользователя диалога (`findFirst` по `senderRole USER`, `orderBy createdAt desc`); при отсутствии таких сообщений — контекст по активной привязке (текущее поведение).

`MessageChannelService` расширяется до `resolveDelivery(contextChannel: 'WEB'|'TELEGRAM'|null, owner)`: контекст `TELEGRAM` + активная привязка → `{ channel: 'TELEGRAM', botName }`, иначе `{ channel: 'WEB', botName: null }`; прежняя сигнатура `resolveDelivery(owner)` сохраняется как «контекст по привязке». Семантика снимка BOT-сообщения: `TELEGRAM` = доставлен и в веб, и в Telegram; `WEB` = только веб.

В `MockBotService.replyAsBot` дополнительно: валидация `replyToMessageId` (есть в БД, тот же `conversationId`, `senderRole === USER`, иначе `BadRequestException` — валидация в сервисе, глобального pipe нет).

Мост в `forwardOutgoing` гейтится по снимку канала самого события: `event.channel !== 'TELEGRAM'` → ранний выход; `event.channel === 'TELEGRAM'` → пересылка (привязочный гейт `telegramBotId`/`telegramChatId`/`isActive` остаётся); при непустом `event.replyTo.telegramMessageId` — с `reply_to_message_id`. Это заменяет прежнюю идею «мост решает по `event.replyTo.channel`»: снимок канала ставится той же функцией, которая принимает решение, — единый источник истины. Альтернатива «мост сам ищет последнее сообщение пользователя» отклонена: решение должно быть зафиксировано в снимке в момент записи ответа.

**D4. Fallback при битой ссылке reply.**
После перепривязки пользователя к другому боту/чату `reply_to_message_id` может указывать на несуществующее в новом чате сообщение — Telegram вернёт ошибку отправки. Чтобы не терять доставку текста, при ошибке отправки с установленным `replyToMessageId` выполняется один повтор без этого параметра; повторная ошибка логируется как сегодня (best-effort мост). Спека фиксирует: цитата на legacy-сообщение без снимка уходит без ссылки.

**D5. Чтение и стриминг.**
`ChatService.getHistory` и `MockBotService.getConversationMessages` добавляют `include: { replyTo: { select: { id, senderRole, content } } }` и мапят `replyTo` в `MessageQuoteDto | null`. SSE-мапперы (`ChatService.toStreamEvent`, `MockBotService.toStreamEvent`) переносят поднабор из `ChatEvent.replyTo`. DTO сообщений и событий дополняется `deliveredTo: Array<'WEB'|'TELEGRAM'>` — выводимым в мапперах (не хранится в БД) полем: снимок `TELEGRAM` → `['WEB','TELEGRAM']`, иначе `['WEB']`; для USER-сообщений — одиночный канал отправки; null-снимок → `['WEB']`. Обновить `backend/README.md` (правила маршрутизации и пометки доставки). `TelegramSender.sendMessage` получает опциональный 4-й параметр `replyToMessageId?: number`; в grammy — опция `reply_to_message_id`. Контракт `MockBotReplyRequestDto` дополняется `replyToMessageId?: string` (`required: false`, чтобы SDK держал поле опциональным). После правки DTO: `npm run start:dev` → `npm run generate:openapi-ts`.

**D6. Фронтенд.**
Консоль: в `MockBotComponent` сигнал `replyTarget: ConversationMessage | null`; кнопка «Ответить» только на сообщениях `senderRole === 'USER'`; индикатор над композером с отменой; `sendReply` передаёт `replyToMessageId`; сброс после успешной отправки и при `selectConversation`; цитата рендерится из `ConversationMessage.replyTo` / `MockBotStreamEvent.replyTo`. Чат пользователя: `ChatComponent` рендерит блок цитаты из `replyTo` и бейдж доставки из `deliveredTo`/`botName`. Типы во `mock-bot.service.ts` и `chat.service.ts` (фронт) дополняются полями. Новых маршрутов/сервисов нет — регистрации в `app.module.ts` не требуются.

## Risks / Trade-offs

- [Точные `toEqual`-проверки в e2e ломаются от новых полей DTO] → обновить shape-проверки (`auth`-паттерн уже известен); для `replyTo` использовать выборочные `toMatchObject` там, где точная форма не нужна.
- [e2e-фикстуры] → только через `ActivityHelper` (test-spawned ADMIN-ключ, `POST /auth/register` и т.д.); данные засиженного `admin@kaufman.bot` не изменяются (навык e2e-fixture-hygiene).
- [Гонка: цель удалена между проверкой и записью] → удалений сообщений нет; FK защитит целостность.
- [Новый nullable-парам в `TelegramSender` ломает существующие моки] → параметр опциональный; спать/моки sender'а в `telegram-bridge.service.spec.ts` обновляются одной строкой сигнатуры.
- [События SSE перегружены] → `replyTo`/`deliveredTo` nullable-совместимы и отсутствуют у большинства событий; клиент игнорирует пустые значения.
- [Смена привычного поведения: обычные ответы и плагинные больше не уходят в Telegram автоматически] → пометка доставки в консоли делает маршрут каждого ответа видимым; правило единообразно для всех ответов бота.
- [Гонка: новое сообщение пользователя между чтением «последнего» и записью ответа] → маршрут фиксируется на момент решения; следующее сообщение пользователя пересчитает контекст.

## Migration Plan

1. Миграция Prisma (добавление двух nullable колонок) — обратно совместима, приложение старой версии продолжает работать на новой схеме.
2. Деплой бэкенда, затем фронта; регенерация SDK до e2e-прогона.
3. Откат: откат кода без откатa миграции (колонки безвредны).

## Open Questions

(нет — поведение зафиксировано в дельтах спеков)
