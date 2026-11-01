# Design

## Context

Бэкенд — NestJS (Express) с URI-версионированием `/api/v1`, Swagger-документ генерируется при старте в `swagger.json`, из него для e2e генерируется SDK (@hey-api/openapi-ts → `test/generated/client`). Аутентификация — API-ключи: `ApiKeyGuard` проверяет `x-api-key` (или `?apiKey=` для SSE-клиентов) и прикрепляет к запросу `authUser`/`authApiKey`; `AdminGuard` даёт паттерн проверки роли `ADMIN`. Схема Prisma: `User` (роль `USER/ADMIN/GUEST`) и `ApiKey`. Сиды — NestJS-сервис с `OnApplicationBootstrap` (`SeedService`), админ сидируется из env. Фронтенд — Angular standalone: пока один дашборд (`AppComponent`) без маршрутов, `HttpClient` через dev-proxy `/api`, есть рабочий образец SSE через `EventSource` (`/time/stream`). Конвенции проекта: контроллеры принимают/возвращают только DTO-классы со Swagger-декораторами; CRUD и use-case сценарии разнесены по разным сервисам; схема БД меняется только миграциями Prisma; e2e — только через сгенерированный SDK на реально запущенном бэкенде, фикстуры — только HTTP-эндпоинтами.

## Goals / Non-Goals

**Goals:**

- Диалог «пользователь ↔ бот» на бэке (REST + SSE) и веб-чат пользователя (`/chat`).
- Консоль мок-сервера бота (`/mock-bot`): список пользователей, переключение, ответ от имени бота, живые события.
- Вход по API-ключу (`POST /auth/login` + страница `/login`) с передачей ключа во всех последующих запросах.
- Сид двух дефолтных пользователей с ролью `USER` и их ключей из env.
- Ссылки на `/chat` и `/mock-bot` в навигации главной страницы.

**Non-Goals:**

- Интеграция с Telegram (не делаем в этой задаче вовсе).
- Автоответы бота, LLM/логика ответов — бота симулирует человек через консоль.
- Вложения (файлы/картинки), редактирование/удаление сообщений, групповые чаты.
- Регистрация из веб-интерфейса и UI-управление ключами (API уже есть, UI — вне рамок).
- Несколько операторов, приватность/шаринг консоли, метрики.

## Decisions

### 1. Данные: `Conversation` + `Message`, миграция Prisma

- `Conversation`: `id`, `userId` (unique, relation → `User`, каскадное удаление), `createdAt`, `updatedAt` → таблица `conversations`. Диалог строго 1:1 (unique `userId`), создаётся лениво при первом сообщении пользователя.
- `Message`: `id`, `conversationId` (relation, каскад), `senderRole` (enum `MessageSenderRole { USER, BOT }` — отдельный enum Prisma, не переиспользуем `Role` пользователей), `content` (varchar(4000)), `readAt` (nullable timestamp — момент прочтения «другой стороной»; единственный читатель сообщения — противоположная сторона, поэтому одного поля достаточно), `createdAt` → таблица `messages`. Индекс `(conversationId, createdAt)` для хронологической выборки.
- Миграция только через `prisma migrate dev --name add_conversations_and_messages` (скилл `prisma-migrations-only`), затем `prisma generate`. Альтернатива «одна таблица messages с userId» отклонена: unique-связка и каскад проще выражаются связкой Conversation→User, и консоли оператора удобнее адресовать диалог целиком.

### 2. Вход по ключу: `POST /auth/login` поверх общего валидатора ключа

- В `ApiKeysService` появляется метод поиска валидного ключа с владельцем (например, `findActiveByKey(key)`), который инкапсулирует текущие проверки `ApiKeyGuard` (существует → активен → не истёк → владелец активен).
- `ApiKeyGuard` переводится на этот метод (поведение не меняется), а `AuthService.login(dto: LoginRequestDto)` использует его и возвращает `AuthProfileDto` — тот же контракт, что у `GET /auth/me` (секрет ключа маскируется `ApiKeysService.toDto`).
- Альтернатива «фронт просто дергает `GET /auth/me` с введённым ключом» отклонена: у логина должна быть собственная операция в API (use-case, по конвенции проекта живёт в `AuthService`), и она явно видна в Swagger/SDK для e2e.

### 3. Домен чата: два use-case сервиса + шина событий

- `ChatService` — сценарии пользователя: `getHistory`, `sendMessage` (ленивое создание диалога), `streamEvents(userId)`; помечает сообщения бота прочитанными при чтении истории пользователем.
- `MockBotService` — сценарии оператора: `listConversations` (join с последним сообщением и count непрочитанных, сортировка по последней активности), `getConversationMessages(userId)` (помечает сообщения пользователя прочитанными), `replyAsBot(userId, content)`, `streamEvents()`.
- Доставка SSE — выделенный провайдер `ChatEventsService` на RxJS `Subject`: `publish(message)` вызывают оба use-case сервиса после записи в БД; оба контроллера возвращают отфильтрованные Observables. Альтернативы: polling с фронта (проще, но «живой» чат вырождается в опрос и расточительнее), WebSocket-шлюз (новый транспорт ради двух страниц — избыточно, в проекте уже есть SSE-паттерн).
- Все ответы контроллеров — DTO-классы (`ChatMessageDto`, `ConversationSummaryDto`, `MockBotStreamEventDto` и т.п.) со Swagger-декораторами; SSE-события — `SseMessageEvent<T>` из `backend/src/interfaces`, поле `type` не задавать (событие по умолчанию `message`), иначе браузерный `EventSource.onmessage` их не получает.

### 4. Контроллеры и права

- `ChatController` (`/chat`): `GET /messages`, `POST /messages` (`201`), `Sse /stream` — под `ApiKeyGuard` (любой активный ключ).
- `MockBotController` (`/mock-bot`): `GET /conversations`, `GET /conversations/:userId/messages`, `POST /conversations/:userId/messages`, `Sse /stream` — под `ApiKeyGuard` + `AdminGuard` (паттерн существующего `/admin/users`: `401` без ключа, `403` «Admin access required» для не-админа).
- Валидация текста сообщения — общая DTO-валидация (непустой trimmed, максимум 4000 символов), сообщения об ошибках — стандартный `ApiErrorDto`.

### 5. Фронтенд: маршруты, сессия, интерцептор

- Маршруты (lazy `loadComponent`): `/login`, `/chat`, `/mock-bot`; `/` — существующий дашборд, к которому добавляется навигация со ссылками «Чат с ботом» и «Мок-сервер бота» (и «Вход»/«Выход» по состоянию сессии).
- `SessionService` (signal-based): хранит ключ и профиль; сохранение в `localStorage` (SSR-safe через `isPlatformBrowser`); методы `login(key)` → `POST /auth/login`, `logout()`, `expire()`.
- Функциональный HTTP-интерцептор добавляет `x-api-key` ко всем запросам к `/api`; при `401` вызывает `expire()` и редиректит на `/login`. Функциональные роут-гарды: без сессии → `/login` (с `returnUrl`); для `/mock-bot` — проверка `role === 'ADMIN'` из профиля (иначе страница показывает отказ, сценарий «доступ не-админа»).
- SSE: `EventSource` c `?apiKey=` (заголовки EventSource задавать нельзя — по этой причине query-параметр уже поддержан `ApiKeyGuard`); при `onerror`/повторном `onopen` история перезагружается целиком, чтобы не терять сообщения за время разрыва.
- Альтернатива «хранить ключ в sessionStorage/памяти» отклонена: перезагрузка страницы не должна требовать повторного входа (требование спецификации `api-key-login`).

### 6. Сид двух USER-пользователей

- В `SeedService` добавляется `seedDefaultUser(env-префикс)`: при наличии всех трёх переменных (`USER{n}_EMAIL`, `USER{n}_PASSWORD`, `USER{n}_API_KEY`) — upsert пользователя по email (роль `USER`, пароль через существующий `hashPassword`) и upsert ключа по значению; при неполном наборе — `Logger.warn` и пропуск только этого пользователя (админ-сид не трогаем). Переменные добавляются в `backend/.env` и `backend/.env.example` (значения-заглушки в example по образцу админских).
- Альтернатива «создавать юзеров только через `POST /auth/register` в e2e» сохраняется для тестов, но дефолтные пользователи нужны как постоянные данные окружения — это работа сида.

### 7. Тесты по конвенциям проекта

- Юнит (Vitest, бэкенд): `ChatService`, `MockBotService`, `ChatEventsService` (Prisma мокается), `AuthService.login`; DTO-валидация текста.
- e2e (Vitest + SDK на живом бэкенде, фикстуры только через HTTP): login (валидный/неверный/пустой), сценарий диалога (register → send → admin reply → user получает по истории и SSE), список консоли с непрочитанными, `403` для USER-ключа на `/mock-bot`. После изменения контракта — перегенерация: `start:dev` → `generate:openapi-ts` → `test:e2e` (ключ админа — `ADMIN_API_KEY` из `backend/.env`).
- Юнит фронта (Jest): `SessionService`, интерцептор, гарды, компоненты `/login`, `/chat`, `/mock-bot` (базовые рендер-тесты).
- e2e фронта (Playwright против живого прод-стека `:3000`): smoke-сценарий — навигация со ссылками, вход ключом, отправка сообщения в чат.

## Risks / Trade-offs

- [SSE-сериализация Nest ломает EventSource: именованные события и JSON.stringify данных] → не задавать `type` события и класть в `data` DTO-объект со строковыми полями (ISO-время, а не `Date`); на фронте `JSON.parse(e.data)` — известный проектный pitfall, уже соблюдён в `/time/stream`.
- [Ключ в URL SSE (`?apiKey=`) может попасть в логи прокси] → приемлемо для мок-окружения; паттерн уже используется проектом для SSE, тестовые ключи не производственные.
- [Лимит браузерных SSE-соединений (6 на домен при HTTP/1.1)] → на каждой странице не более одного EventSource; при необходимости — HTTP/2 на проде.
- [Гонка «прочтение vs новое сообщение» при mark-read] → обновление `readAt` делаем `updateMany` по условию (сообщения старше момента выборки), двойная запись не ломает счётчик; точность счётчика в мок-режиме не критична.
- [Разрыв SSE теряет события] → после реконнекта фронт перезагружает историю; события идемпотентны (по id сообщения).
- [Prod: SPA-маршруты `/chat`, `/mock-bot` при ServeStaticModule] → модуль по умолчанию отдаёт `index.html` на неизвестные пути, API исключён через `exclude` — deep-links работают; проверить на prod-стеке.
- [Миграция на проде] → деплой по конвенции: `prisma migrate deploy` перед рестартом; миграция аддитивная (новые таблицы), откат — деплой предыдущей версии без использования новых фич.

## Migration Plan

1. `backend`: `prisma migrate dev --name add_conversations_and_messages` + `prisma generate`.
2. Реализация бэка (login, чат, мок-бот, сид) → старт бэка пишет `swagger.json` → `npm run generate:openapi-ts`.
3. `frontend`: маршруты/сессия/страницы/навигация.
4. Тесты: юнит → e2e против живого стека → prod-проверка (`start-prod.sh`, миграции — `prisma:migrate`).
5. Откат: аддитивная миграция позволяет вернуть предыдущий билд без даунгрейда схемы.

## Open Questions

Нет — материальных развилок, влияющих на спеки или декомпозицию, не осталось; допущения (роль `ADMIN` для консоли, SSE, env-сид) зафиксированы в proposal.md и отражены в спеках.
