# Tasks

## 1. Схема БД и сид дефолтных пользователей

- [ ] 1.1 Добавить в `backend/prisma/schema.prisma` enum `MessageSenderRole { USER, BOT }`, модели `Conversation` (unique `userId`, каскад к `User`) и `Message` (`senderRole`, `content` varchar(4000), `readAt?`, индекс `(conversationId, createdAt)`); создать миграцию `npx prisma migrate dev --name add_conversations_and_messages` и выполнить `npx prisma generate`. Проверка: `npm run prisma:status` показывает применённую миграцию; `node_modules/.bin/tsc --noEmit --skipLibCheck` в backend проходит.
- [ ] 1.2 Расширить `SeedService`: метод сида дефолтного USER-пользователя по env-префиксу (upsert пользователя по email с ролью `USER` и паролем через `hashPassword`, upsert ключа по значению), вызовы для `USER1_*` и `USER2_*`; при неполном наборе переменных — предупреждение и пропуск только этого пользователя. Добавить `USER1_EMAIL/USER1_PASSWORD/USER1_API_KEY` и `USER2_EMAIL/USER2_PASSWORD/USER2_API_KEY` в `backend/.env` и `backend/.env.example`. Проверка: юнит-тест сида (`vitest run`) — полный набор создаёт двух USER, частичный пропускает с warn; повторный старт бэка не дублирует записи (stats в `/api/v1/health` не растут).

## 2. Вход по API-ключу на бэкенде

- [ ] 2.1 Вынести проверки ключа из `ApiKeyGuard` в `ApiKeysService` (метод поиска валидного ключа с владельцем: существует → активен → не истёк → владелец активен), перевести гард на этот метод. Проверка: существующие e2e `auth.e2e-spec.ts` и `api-keys.e2e-spec.ts` зелёные (`npx vitest run --config vitest.config.e2e.ts` на запущенном бэке).
- [ ] 2.2 Добавить `POST /api/v1/auth/login` в `AuthController` + `AuthService.login` (DTO `LoginRequestDto { apiKey }` → `AuthProfileDto`, `400` без ключа, `401` невалидного) с полным набором Swagger-декораторов (скилл `controller-dto-swagger`). Проверка: юнит-тесты `AuthService.login` (`npx vitest run`), endpoint присутствует в `swagger.json` после старта бэка.
- [ ] 2.3 Перегенерировать SDK для e2e (старт бэка → `npm run generate:openapi-ts`) и добавить e2e-тесты login в `backend/test/auth.e2e-spec.ts`: валидный ключ → профиль, несуществующий/неактивный → 401, пустой → 400. Проверка: `npm run test:e2e` зелёный на запущенном бэке.

## 3. Домен чата на бэкенде

- [ ] 3.1 Создать провайдер `ChatEventsService` (RxJS Subject, `publish(message)` и поток событий по диалогу). Проверка: юнит-тест — подписчик получает опубликованное событие, фильтрация по диалогу работает (`npx vitest run`).
- [ ] 3.2 Создать `ChatService` + DTO (`ChatMessageDto`, `SendMessageRequestDto` и др.) + `ChatController` (`GET /chat/messages`, `POST /chat/messages` → 201, `Sse /chat/stream` под `ApiKeyGuard`): ленивое создание диалога, валидация текста (непустой trimmed, ≤4000), история по возрастанию `createdAt`, mark-read сообщений бота при чтении, публикация событий через `ChatEventsService`; SSE-событие по умолчанию `message` без поля `type`, `data` — DTO со строками (ISO-время). Проверка: юнит-тесты `ChatService` и контроллера (`npx vitest run`).
- [ ] 3.3 Добавить e2e `backend/test/chat.e2e-spec.ts`: история пустого диалога → 200 [], отправка сообщения → 201 и в истории, валидация (пустое/длинное → 400), без ключа → 401, изоляция (история пользователя A не содержит сообщений пользователя B). Проверка: `npm run test:e2e` зелёный.

## 4. Мок-сервер бота на бэкенде

- [ ] 4.1 Создать `MockBotService` + DTO (`ConversationSummaryDto`, `MockBotStreamEventDto` и др.) + `MockBotController` (`GET /mock-bot/conversations`, `GET /mock-bot/conversations/:userId/messages`, `POST /mock-bot/conversations/:userId/messages`, `Sse /mock-bot/stream`) под `ApiKeyGuard` + `AdminGuard`: список с последним сообщением, непрочитанными и сортировкой по активности; чтение диалога помечает сообщения пользователя прочитанными; ответ от имени `BOT` публикует событие в `ChatEventsService`; ошибки 404/400/401/403. Проверка: юнит-тесты `MockBotService` (`npx vitest run`).
- [ ] 4.2 Добавить e2e `backend/test/mock-bot.e2e-spec.ts`: доступ админским ключом, `403` для USER-ключа, `401` без ключа, список отсортирован и содержит непрочитанные, чтение диалога обнуляет счётчик, ответ → 201, несуществующий userId → 404. Проверка: `npm run test:e2e` зелёный.

## 5. Интеграционный e2e сценария «пользователь ↔ бот»

- [ ] 5.1 Добавить e2e сценарий диалога через SDK (новый спек или расширение chat-спека): register-фикстура пользователя → пользователь отправляет сообщение → оператор получает SSE-событие и видит непрочитанное в списке → админ отвечает → пользователь получает SSE-событие и видит ответ в истории. Проверка: `npm run test:e2e` зелёный на запущенном бэке.

## 6. Фронтенд: сессия, вход, навигация

- [ ] 6.1 Создать `SessionService` (signal-состояние: ключ + профиль, `localStorage` с защитой `isPlatformBrowser`, `login/logout/expire` через `POST /api/v1/auth/login`), функциональный HTTP-интерцептор (`x-api-key` для `/api`, при 401 — `expire()` и редирект на `/login`) и роут-гарды (без сессии → `/login`; для `/mock-bot` — роль `ADMIN`). Проверка: юнит-тесты (Jest, `npm test` в frontend) на сервис, интерцептор и гарды.
- [ ] 6.2 Добавить маршруты (`/login`, `/chat`, `/mock-bot` через `loadComponent`, гарды в `app.routes.ts`) и страницу `/login` (ввод ключа, ошибка при 401, переход на `returnUrl`). Проверка: юнит-тесты страницы и роутов (`npm test`).
- [ ] 6.3 Добавить на дашборд (`/`) навигацию со ссылками «Чат с ботом» (`/chat`) и «Мок-сервер бота» (`/mock-bot`) и кнопкой входа/выхода по состоянию сессии. Проверка: юнит-тест рендера навигации (`npm test`).

## 7. Фронтенд: страницы чата и консоли мок-сервера

- [ ] 7.1 Создать компонент страницы `/chat` + chat-сервис (`GET/POST /api/v1/chat/messages`, SSE `EventSource` на `/api/v1/chat/stream?apiKey=`): история, отправка, появление новых сообщений без перезагрузки, перезагрузка истории при реконнекте. Проверка: юнит-тесты компонента (рендер, отправка, приём события) — `npm test`.
- [ ] 7.2 Создать компонент страницы `/mock-bot` + сервис консоли (`GET /api/v1/mock-bot/conversations`, истории и ответа, SSE `/api/v1/mock-bot/stream?apiKey=`): список пользователей с непрочитанными и порядком по активности, переключение кликом, отправка ответа, обновление без перезагрузки, экран отказа при не-`ADMIN`. Проверка: юнит-тесты компонента — `npm test`.
- [ ] 7.3 Проверить компиляцию и сборку фронта: `node_modules/.bin/tsc --noEmit -p tsconfig.app.json` и `npm run build` в frontend без ошибок.

## 8. Финальная интеграция и документация

- [ ] 8.1 Прогнать весь набор проверок: backend юниты (`npx vitest run`), backend e2e (`npm run test:e2e` на запущенном бэке), frontend юниты (`npm test`), frontend e2e Playwright smoke на прод-стеке `:3000` (навигация ведёт на `/chat` и `/mock-bot`, вход ключом `USER1_API_KEY`, отправка сообщения в чат) — `npm run test:e2e` в frontend. Проверка: все команды завершаются успешно.
- [ ] 8.2 Обновить `backend/README.md`: новые эндпоинты (`/auth/login`, `/chat/*`, `/mock-bot/*`), env-переменные `USER1_*`/`USER2_*`, описание веб-чата и мок-сервера. Проверка: README содержит разделы, команды из него воспроизводимы.
- [ ] 8.3 Prod-проверка: `npm run prisma:migrate` (deploy), `./start-prod.sh`; deep-links `/chat`, `/mock-bot` отдают SPA, вход сидовыми ключами работает в обоих интерфейсах. Проверка: `curl -s http://localhost:3000/chat` возвращает HTML приложения, диалог пользователь↔бот проходит через прод-стек.

## Workflow follow-up

- После ревью артефактов запустить реализацию: `/opsx:apply`.
- После реализации и приёмки заархивировать изменение: `/opsx:archive` (спеки синхронизируются в `openspec/specs/`).
