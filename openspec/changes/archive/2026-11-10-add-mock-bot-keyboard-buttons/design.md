# Design

## Context

См. proposal.md (Why). Что определяет подход (текущее состояние):

- `Message` хранит только `content: String`; `senderRole` — enum `USER | BOT`. Ответ оператора (`MockBotService.replyAsBot`) и ответ плагина (`BotPluginsService`) пишут `BOT`-сообщение и публикуют `ChatEvent` в in-memory шину `ChatEventsService`; `ChatService.sendMessage` пишет `USER`-сообщение, в той же транзакции создаёт `BotPluginTask` и публикует событие.
- Плагин-диспетчер срабатывает на любое `USER`-сообщение через outbox-задачу. Чтобы нажатие кнопки не вызывало автоответ, такой путь должен не создавать `BotPluginTask`.
- `ChatService.getHistory`/`streamEvents` отдают все сообщения диалога; `MockBotService.getConversationMessages`/`streamEvents` — тоже все (для оператора). Разделение «видно оператору / скрыто от пользователя» придётся ввести явно.
- В `main.ts` нет глобального `ValidationPipe` — вся валидация в сервисах через `BadRequestException`/`NotFoundException`. Контроллеры принимают/возвращают только DTO со Swagger-декораторами; вложенные DTO связываются `@ApiProperty({ type })` + `@ApiExtraModels`. Обязательность полей SDK наследуется из аннотаций (`required`).
- Схема БД меняется только миграциями Prisma; enum/типы импортируются из `src/generated/prisma/enums.js` (не из `@prisma/client`). Провайдеры/контроллеры регистрируются вручную в `AppModule`.
- E2E идут через сгенерированный OpenAPI SDK на живом бэкенде; после смены контракта — `start:dev` → `generate:openapi-ts` → `test:e2e`. Фикстуры создаются только эндпоинтами; второй админ для проверки области видимости получает роль через `PATCH /api/v1/admin/users/{id}`.

## Goals / Non-Goals

**Goals:**

- Сообщения бота носят inline-кнопки (`title` + `callback_data`) как неизменяемый снимок в момент отправки.
- Текст ответа оператора опционален при наличии кнопок; полностью пустое сообщение отвергается.
- Пресеты кнопок — отдельная сущность с владельцем-админом и CRUD под ролью `ADMIN`, переиспользуемая в любых диалогах.
- Нажатие кнопки пользователем попадает к оператору как `USER`-сообщение, но не отображается у самого пользователя и не триггерит плагины.

**Non-Goals:**

- Реальная Telegram-интеграция; обработка `callback_query`/редактирование клавиатуры «в сообщённом» виде.
- Много рядная/сеточная раскладка кнопок, типы кнопок (URL, switch, pay) — только `callback_data`.
- Разрешение совместного редактирования пресетов между админами и шаринг пресетов.
- Персистентная гарантия доставки SSE-событий (шина остаётся in-memory).

## Decisions

### D1. Кнопки сообщения — JSON-снимок на `Message`, а не нормализованная таблица

В `Message` добавляется поле `buttons Json?` — массив `{ title: string; callbackData: string }` в порядке отправки. Это снимок: дальнейшая судьба пресета на него не влияет, что соответствует требованию «Снимок кнопок в отправленном сообщении» и семантике Telegram (клавиатура остаётся у сообщения).

Альтернатива — таблица `MessageButton` с FK на сообщение. Отклонено: кнопки не требуются для запросов/целостности по отдельности, а нормализация добавила бы join ради read-only отображения. Чтение из `Json` типизируется в сервисе через `toButtons(value): KeyboardButtonDto[]` с защитой от некорректной формы (`null`/не массив → `null`).

### D2. Различение кнопочного коллбэка — enum `MessageKind`

Новый enum `MessageKind { TEXT, BUTTON }`; у `Message` поле `kind MessageKind @default(TEXT)`. Обычные сообщения (текст пользователя, ответы бота/оператора) — `TEXT`. Сообщения, порождённые нажатием кнопки, — `BUTTON` (при `senderRole = USER`). Дефолт `TEXT` сохраняет обратную совместимость существующих строк без backfill.

`BUTTON` — единственный признак для подавления эха: пользовательская история/поток фильтруют `kind = BUTTON`, операторская выдача — нет. Альтернатива (булево `hiddenFromSender`) отклонена: enum расширяем и выразительнее для будущей дифференциации источников.

### D3. Пресет кнопок — сущность `ButtonPreset` с владельцем

```prisma
model ButtonPreset {
  id        String   @id @default(cuid())
  name      String
  buttons   Json     // массив { title, callbackData }
  ownerId   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  owner     User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  @@index([ownerId])
  @@map("button_presets")
}
```

В `User` добавляется `presets ButtonPreset[]`. Владелец — `req.user.id` админа из `ApiKeyGuard`; все операции (`findMany`/`update`/`delete`) фильтруются по `ownerId`, чужой id даёт `404` (`updateMany`/`deleteMany` с условием `id + ownerId`, проверка `count`). Кнопки пресета хранятся в том же JSON-формате, что и снимок сообщения.

### D4. CRUD пресетов — отдельный сервис-сущность и контроллер

Новые `ButtonPresetsService` (только CRUD + валидация кнопок) и `ButtonPresetsController` (`mock-bot/presets`, `@UseGuards(ApiKeyGuard, AdminGuard)`): `POST` (create), `GET` (list), `PATCH /:id` (update), `DELETE /:id` (remove). Разделение «CRUD-сущность отдельно от use-case» соответствует конвенции проекта (`UsersService`/`ApiKeysService` рядом с `AuthService`). Диспетчер сообщений (`MockBotService`) остаётся use-case и не знает про CRUD пресетов.

### D5. Применение «активного пресета» — состояние фронта, кнопки уходят в теле ответа

«Активный пресет» — клиентская рабочая область консоли: оператор загружает пресет в набор кнопок либо строит ad-hoc набор. При отправке `POST mock-bot/conversations/{userId}/messages` тело несёт итоговый `buttons[]`; бэкенд не хранит «активный» пресет и не резолвит его по id — только снимает переданные кнопки в `Message.buttons`. Это сохраняет снимок независимым от последующего редактирования пресета и не вводит скрытого состояния на сервере.

### D6. Путь нажатия кнопки — отдельный эндпоинт, а не флаг у отправки текста

Новый `POST /api/v1/chat/button-callbacks` (`ButtonCallbackRequestDto { callbackData }`) в `ChatController` → `ChatService.submitButtonCallback(user, dto)`: upsert диалога, создание `Message` (`senderRole=USER, kind=BUTTON, content=callbackData`), публикация `ChatEvent { kind: BUTTON }`, БЕЗ создания `BotPluginTask` и БЕЗ вызова диспетчера. Возврат `201` + `ChatMessageDto` (клиент его не рендерит).

Альтернатива — расширить `POST /chat/messages` дискриминатором. Отклонено: основной путь отправки текста должен остаться неизменным (он всегда создаёт outbox-задачу), а отдельный маршрут самодокументируем и исключает ложный триггер плагинов.

### D7. Подача кнопок и подавление эха в существующих каналах

- `ChatEvent` (шина) дополняется `kind` и `buttons`.
- `ChatService.getHistory`: `where.kind != BUTTON` (исключает коллбэки пользователя); `toDto` прокидывает `buttons`.
- `ChatService.streamEvents`: перед маппингом в `ChatStreamEventDto` фильтруются события `kind = BUTTON` — пользователь не получает эхо вживую.
- `MockBotService.getConversationMessages`/`streamEvents`: фильтр по `kind` НЕ применяют (оператор видит коллбэки как `USER`-сообщения).
- `MockBotService.replyAsBot(userId, content, buttons)`: сохраняет `buttons` в сообщение, публикует событие с `buttons`, `kind = TEXT`.

`ChatMessageDto`/`ChatStreamEventDto`/`MockBotStreamEventDto` получают `buttons` (`@ApiProperty({ type: KeyboardButtonDto, isArray: true, nullable: true })`, всегда заполняется — `null` либо массив). Вложенный `KeyboardButtonDto { title, callbackData }` связывается через `@ApiExtraModels`.

### D8. Валидация и лимиты (в сервисах, константы рядом со сценарием)

`MockBotReplyRequestDto`: `content?` (`@ApiProperty({ required: false, maxLength: 4000 })`), `buttons?: KeyboardButtonDto[]`. `MockBotService.replyAsBot` после trim: если `content` пуст и кнопок нет → `400` («нужен текст или хотя бы одна кнопка»); прежняя проверка длины текста сохраняется; кнопки валидируются общим валидатором.

Общий валидатор кнопок (`MAX_BUTTONS = 12`, `MAX_TITLE_LENGTH = 64`, `MAX_CALLBACK_LENGTH = 256`): непустые `title`/`callbackData`, соблюдение длин, количество в 1..12 — иначе `400`. Применяется и в `replyAsBot`, и в `ButtonPresetsService` (create/update). `callbackData` в `button-callbacks` валидируется на непустоту и длину ≤ 256.

### D9. Фронтенд

- `/chat` (`chat.component.ts`, `chat.service.ts`): `ChatMessage.buttons`; рендер панели кнопок под пузырями `BOT`; клик → `ChatService.sendButtonCallback(callbackData)` (`POST chat/button-callbacks`), локальный список НЕ дополняется (подавление эха на клиенте дублирует серверное).
- `/mock-bot` (`mock-bot.component.ts`, `mock-bot.service.ts`): рабочая область кнопок (массив с add/edit/remove до отправки), панель пресетов (список своих, «сохранить текущий как пресет», «загрузить активным», edit, delete) через новые методы сервиса; `sendReply` расширяется аргументом `buttons`; рендер кнопок у `BOT`-сообщений; `USER`-сообщения-коллбэки отображаются как обычные сообщения пользователя (приходят историей/потоком оператора).

## Risks / Trade-offs

- [Опционализация `content` ломает строгих клиентов SDK] → Поле объявлено `required: false` со `nullable`; сервер по-прежнему отвергает полностью пустое сообщение; e2e фиксирует новый контракт. Откат контента невозможен без возврата обязательности — принято осознанно.
- [`Json`-колонка без схемы: риск мусор-данных] → Единственный писатель — сервис после валидатора; читатель `toButtons` защищает форму и отдаёт `null` на некорректном значении; прямого SQL/`db push` нет (только миграции).
- [Подавление эха требует согласованности трёх мест (история, SSE, отклик клика)] → Единый критерий `kind = BUTTON`; юнит/e2e проверяют все три канала пользователя и тот факт, что операторская выдача их содержит.
- [Нажатие кнопки визуально «без ответа» для пользователя] → Осознанное требование («без эха»); фидбек оператору — в консоли. Кнопки — инструмент наблюдения/отладки, не диалоговый автоответ.
- [Проверка изоляции пресетов между админами] → Второй админ поднимается через `PATCH /api/v1/admin/users/{id}` (роль `ADMIN`); если эндпоинт не позволит сменить роль, изоляция доказывается на уровне юнит-теста сервиса.

## Migration Plan

1. Миграция `add_message_kind_and_buttons`: enum `MessageKind`, `Message.kind @default(TEXT)`, `Message.buttons Json?` — `npx prisma migrate dev --name add_message_kind_and_buttons` из `backend/` (нужен `backend/.env`), затем `npx prisma generate`.
2. Миграция `add_button_presets`: модель `ButtonPreset` + связь `User.presets` — аналогично `migrate dev --name add_button_presets` + `generate`.
3. Код сервисов/контроллеров/DTO, регистрация `ButtonPresetsController`/`ButtonPresetsService` в `AppModule`.
4. `npm run start:dev` (перезапись `swagger.json`) → `npm run generate:openapi-ts` → `npm run test:e2e`.
5. Фронтенд-изменения, `ng build`.
   Откат: откат миграций через `prisma migrate reset`/новые обратные миграции не требуется для prod-данных (поля nullable, дефолт `TEXT`); при откате кода достаточно не использовать новые эндпоинты.

## Open Questions

- Максимальное число кнопок/лимиты (12/64/256) — выбраны как разумные; уточняются позже, не влияют на контракты спецификаций beyond `400`.
