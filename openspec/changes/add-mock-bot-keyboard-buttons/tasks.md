# Tasks

## 1. Схема БД

- [ ] 1.1 Обе миграции Prisma одним заходом: enum `MessageKind { TEXT, BUTTON }` и поля `Message.kind MessageKind @default(TEXT)` + `Message.buttons Json?` (миграция `add_message_kind_and_buttons`); модель `ButtonPreset` (`name String`, `buttons Json`, `ownerId` → `User` c `onDelete: Cascade`, `createdAt`/`updatedAt`, `@@index([ownerId])`, `@@map("button_presets")`) и обратная связь `User.presets ButtonPreset[]` (миграция `add_button_presets`). Создать из `backend/` (нужен `backend/.env`) через `npx prisma migrate dev`, затем `npx prisma generate`; enum/типы импортировать из `src/generated/prisma`. Проверка: обе миграции применены без ошибок, `npx tsc --noEmit -p tsconfig.json` в `backend/` — exit 0

## 2. Контракт кнопок: DTO и общий валидатор

- [ ] 2.1 Весь слой контрактов и валидации сразу: `backend/src/dto/keyboard.dto.ts` (`KeyboardButtonDto { title, callbackData }`, `maxLength` 64/256); добавить `buttons` (`@ApiProperty({ type: KeyboardButtonDto, isArray: true, nullable: true })` + `@ApiExtraModels`) в `ChatMessageDto`, `ChatStreamEventDto`, `MockBotStreamEventDto`; сделать `MockBotReplyRequestDto.content` опциональным (`required: false, maxLength: 4000`) и добавить `buttons?`; добавить `ButtonCallbackRequestDto { callbackData }` в `chat.dto.ts`; создать `button-presets.dto.ts` (`CreateButtonPresetRequestDto`, `UpdateButtonPresetRequestDto`, `ButtonPresetDto`); общий валидатор `backend/src/utils/keyboard-buttons.ts` (`MAX_BUTTONS=12`, `MAX_TITLE_LENGTH=64`, `MAX_CALLBACK_LENGTH=256`; `validateButtons` → `BadRequestException`; `toButtons(json) → KeyboardButtonDto[] | null` с защитой формы) c юнит-тестами `keyboard-buttons.spec.ts`. Проверка: `npx tsc --noEmit` — exit 0; `npx vitest run` (юниты валидатора) — зелёный

## 3. Бэкенд: кнопки в ответе оператора (мок-сервер → пользователь)

- [ ] 3.1 Расширить `MockBotService.replyAsBot(userId, content, buttons)`: trim `content`; если `content` пуст И кнопок нет → `BadRequestException`; сохранить прежнюю проверку длины текста; `validateButtons` при непустом наборе; писать `buttons` (`Json`) и `kind: TEXT` в `message.create`; прокидывать `buttons` в `ChatMessageDto` и публикуемый `ChatEvent`; в `getConversationMessages`/`toStreamEvent` выдавать `buttons` через `toButtons` и НЕ фильтровать по `kind` (оператор видит всё). Передать `dto.buttons` из `MockBotController.replyAsBot`. Юнит-тесты `mock-bot.service.spec.ts`: текст+кнопки → сохраняются; только кнопки (без текста) → успех; пусто (ни текста, ни кнопок) → BadRequest; некорректные кнопки → BadRequest; история отдаёт кнопки. Проверка: `npx vitest run` — зелёный, `npm run lint` — без новых замечаний

## 4. Бэкенд: CRUD пресетов кнопок

- [ ] 4.1 Создать целиком `ButtonPresetsService` (только CRUD: `create(ownerId, dto)`, `listForOwner(ownerId)`, `update(ownerId, id, dto)`, `remove(ownerId, id)` через условные `updateMany`/`deleteMany` с `{ id, ownerId }` и `NotFoundException` при `count === 0`; валидация имени и `validateButtons`; маппинг в `ButtonPresetDto` через `toButtons`) и `ButtonPresetsController` (`@Controller('mock-bot/presets')`, `@UseGuards(ApiKeyGuard, AdminGuard)`, `@ApiTags`/`@ApiHeader` как в `MockBotController`; `POST`→201, `GET`→200 массив, `PATCH /:id`→200, `DELETE /:id`→204; `ownerId` из `requireAuthUser(req).id`; полные Swagger-декораторы с `ApiErrorDto`). Юнит-тесты `button-presets.service.spec.ts` (моки `PrismaService`): создание с `ownerId`, пустой список кнопок → BadRequest, `update`/`remove` чужого (count 0) → NotFound, `listForOwner` фильтрует по `ownerId`. Проверка: `npx tsc --noEmit` — exit 0, `npx vitest run` — зелёный, `npm run lint` — без новых замечаний

## 5. Бэкенд: кнопочный callback и подавление эха

- [ ] 5.1 В `ChatService` добавить `submitButtonCallback(user, dto)`: trim+валидация непустоты/длины `callbackData`, upsert диалога, `message.create({ senderRole: USER, kind: BUTTON, content })` БЕЗ `botPluginTask` и БЕЗ вызова `BotPluginsService`, публикация `ChatEvent { kind: BUTTON }`, возврат `ChatMessageDto` (`buttons: null`). Добавить `@Post('button-callbacks')` в `ChatController` (201, Swagger по паттерну `POST /chat/messages`). Подавление эха: `getHistory` исключает `kind: BUTTON` из выборки; `toDto` прокидывает `buttons` через `toButtons`; `streamEvents` фильтрует события `kind === BUTTON` до маппинга; в `sendMessage`/`publishEvent` проставить `kind: TEXT`. Юнит-тесты `chat.service.spec.ts`: `submitButtonCallback` не плодит `botPluginTask` и публикует `kind: BUTTON`; `getHistory` не возвращает BUTTON-сообщения; обычный `sendMessage` по-прежнему создаёт задачу. Проверка: `npx vitest run` — зелёный, `npm run lint` — без новых замечаний

## 6. Регистрация в AppModule и перегенерация Swagger/SDK

- [ ] 6.1 Зарегистрировать `ButtonPresetsController` (в `controllers`) и `ButtonPresetsService` (в `providers`) в `backend/src/app.module.ts`; перезапустить бэкенд (`npm run start:dev` из `backend/`) для записи `swagger.json` и выполнить `npm run generate:openapi-ts`. Проверка: `npx tsc --noEmit -p tsconfig.json` в `backend/` — exit 0, `npx vitest run` — зелёный; в `swagger.json` есть `POST /api/v1/chat/button-callbacks`, операции `mock-bot/presets`, `buttons` в `ChatMessageDto`, опциональный `content` в `MockBotReplyRequestDto`; в `backend/test/generated/client` появились соответствующие типизированные операции

## 7. E2E на живом бэкенде

- [ ] 7.1 E2E консоли и пресетов (SDK + `ActivityHelper`): дополнить `backend/test/mock-bot.e2e-spec.ts` (текст+кнопки → 201 с `buttons`; только кнопки при пустом `content` → 201; пусто ни текста ни кнопок → 400; порядок кнопок сохранён) и создать `backend/test/button-presets.e2e-spec.ts` (CRUD create→list→patch→delete; `403` для USER-ключа; изоляция по владельцу — второго аккаунта повышать до `ADMIN` через `PATCH /api/v1/admin/users/{id}`, каждый видит только свой пресет, `PATCH`/`DELETE` чужого → 404; некорректные кнопки → 400; teardown пресетов и аккаунтов). Проверка: `npm run test:e2e` — зелёный
- [ ] 7.2 E2E «тихого» нажатия: создать `backend/test/keyboard-buttons.e2e-spec.ts` (оператор шлёт сообщение с кнопками; пользователь в `GET /chat/messages` видит кнопки; `POST /chat/button-callbacks` с `callbackData: 'ping'` → 201; у пользователя в истории НЕТ этого коллбэка и НЕТ автоответа `pong` (плагины не сработали); оператор в `GET /mock-bot/conversations/{userId}/messages` видит `USER`-сообщение `ping`). Проверка: `npm run test:e2e` — зелёный

## 8. Фронтенд: чат пользователя

- [ ] 8.1 `frontend/src/app/chat.service.ts` (`buttons` в `ChatMessage` и `ChatStreamEvent`, метод `sendButtonCallback(callbackData)` → `POST /api/v1/chat/button-callbacks` с `catchError → of(null)`) и `frontend/src/app/chat/chat.component.ts` (рендер панели кнопок под пузырями `BOT` по `msg.buttons`, подпись = `title`; обработчик клика вызывает `sendButtonCallback` и НЕ добавляет сообщение в локальный список; стили кнопок). Юнит-тесты `chat.component.spec.ts`: кнопки рендерятся у сообщения с `buttons`, клик дёргает сервис, эхо не появляется. Проверка: `npm test` в `frontend/` — зелёный

## 9. Фронтенд: консоль мок-сервера

- [ ] 9.1 `frontend/src/app/mock-bot.service.ts` (`sendReply(userId, content, buttons?)`, `buttons` в `ConversationMessage`, типы `KeyboardButton`/`ButtonPreset` и методы `listPresets/createPreset/updatePreset/deletePreset`) и конструктор кнопок в `mock-bot.component.ts`: динамическое добавление/редактирование (`title`+`callback_data`)/удаление кнопок в рабочей области до отправки, передача набора в `sendReply`, рендер кнопок у `BOT`-сообщений, отображение `USER`-сообщений-коллбэков. Юнит-тесты `mock-bot.component.spec.ts` (add/edit/remove кнопки; отправка с непустым набором несёт `buttons`). Проверка: `npm test` в `frontend/` — зелёный
- [ ] 9.2 Панель пресетов в `mock-bot.component.ts`: список своих пресетов (загрузка при инициализации), «сохранить текущий набор как пресет» (с именем), «загрузить активным» (копирует кнопки в рабочую область), редактирование и удаление пресета. Юнит-тесты: save → появляется в списке, load → заполняет рабочую область, delete → исчезает. Проверка: `npm test` в `frontend/` — зелёный

## 10. Документация и финальная интеграция

- [ ] 10.1 Дополнить `backend/README.md` разделом про inline-кнопки (снимок кнопок на сообщении, `MessageKind`, опциональный `content`, эндпоинты `/api/v1/mock-bot/presets` и `/api/v1/chat/button-callbacks`, правила «без эха» и «плагины не реагируют на нажатие») и выполнить полный прогон: `npx vitest run` и `npm run test:e2e` (бэкенд), `npm test` и `ng build` (фронт). Проверка: раздел в README присутствует и соответствует коду/маршрутам; все тестовые наборы зелёные; сборка фронта без ошибок

## Workflow follow-up

- Ручная проверка на живом стеке: оператор собирает кнопки и сохраняет пресет, отправляет сообщение с активным пресетом; пользователь видит кнопки, нажатие не даёт эха у пользователя, но видно оператору; при необходимости прод-проверка deep-links (`./start-prod.sh`).
- Архивировать изменение (`openspec-archive-change`): синхронизировать новую capability `button-presets` и модификации `mock-bot-console`/`user-chat` в `openspec/specs/`.
