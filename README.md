# KaufmanBot

**Fullstack-проект с AI с нуля до продакшена: NestJS + Angular + Prisma + PostgreSQL.**

![NestJS](https://img.shields.io/badge/NestJS-12-e0234e)
![Angular](https://img.shields.io/badge/Angular-19-DD0031)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6)

**KaufmanBot** — учебно-демонстрационный fullstack-проект и публичный дневник
разработки. С одной стороны это рабочая платформа для управления ботами с
API-ключами: регистрация, выпуск и отзыв ключей, роли, админ-панель и мониторинг.
С другой — полигон, на котором шаг за шагом показывается полный цикл создания
production-приложения с AI-ассистентом в Qoder IDE: от пустого репозитория до
CI/CD, e2e-тестов и продакшена.

- 🎬 **Видео-серия** — [4 части](#-видео-серия-fullstack-проект-с-ai) на YouTube, Rutube и VK Видео
- 💻 **Код** — [github.com/kaufman-bot/kaufman-bot](https://github.com/kaufman-bot/kaufman-bot)
- 📝 **Серия на сайте автора** — [site15.ru/#videos](https://site15.ru/#videos)
- 👤 **Автор** — Ильшат Хамитов, [site15.ru](https://site15.ru)

## 📚 Оглавление

- [О проекте](#-о-проекте)
- [Видео-серия «Fullstack-проект с AI»](#-видео-серия-fullstack-проект-с-ai)
- [Возможности](#-возможности)
- [Технологии](#-технологии)
- [Архитектура](#-архитектура)
- [Структура проекта](#-структура-проекта)
- [Быстрый старт](#-быстрый-старт)
- [Запуск и остановка](#-запуск-и-остановка)
- [API](#-api)
- [База данных](#-база-данных)
- [VS Code расширения](#-vs-code-расширения)
- [MCP-серверы](#-mcp-model-context-protocol-серверы)
- [NPM-скрипты](#-npm-скрипты)
- [Тестирование](#-тестирование)
- [CI/CD на GitHub Actions](#-cicd-на-github-actions)
- [Форматирование и линтинг](#-форматирование-и-линтинг)
- [Безопасность](#-безопасность)
- [Решение проблем](#-решение-проблем)
- [Участие в проекте](#-участие-в-проекте)
- [Лицензия](#-лицензия)
- [Автор](#-автор)

## 🎯 О проекте

**KaufmanBot** — платформа для управления ботами с API-ключами. Пользователь
регистрируется, получает первый ключ и дальше управляет ими: выпускает новые,
переименовывает, продлевает, отключает и отзывает. Администратор видит все
аккаунты вместе с ключами, может менять роли и деактивировать пользователей.
Дашборд показывает состояние системы в реальном времени: health-check с метриками
БД, памяти и CPU и SSE-поток времени сервера.

Проект задуман как **учебный полигон и референс полного цикла**: на нём
отрабатываются подходы, которые обычно остаются за кадром — AI-assisted
development, типизированный контракт API, два разных окружения и CI/CD с
e2e-прогоном живого стека. Часть решений здесь намеренно «показательная»:
важнее продемонстрировать инструмент и объяснить выбор, чем сократить код.

Что отрабатывается на проекте:

- **AI-assisted development** — работа с LLM в Qoder IDE, проектные MCP-серверы и skills для агента;
- **контракт API** — DTO со Swagger-декораторами → `swagger.json` → SDK → e2e-тесты;
- **два окружения** — dev с Angular dev-server и прокси, prod с фронтендом внутри бэкенда;
- **CI/CD** — GitHub Actions с отчётами о тестах и ручным прогоном e2e на прод-сборке;
- **инфраструктура** — Docker Compose, Prisma-миграции, PM2 и S3-совместимое хранилище MinIO.

Статус: проект в активной разработке и развивается публично — новые части серии
добавляют функциональность и новые инженерные практики.

## 🎬 Видео-серия «Fullstack-проект с AI»

Публичный дневник разработки KaufmanBot: в каждой части проект прирастает новой
production-функциональностью, а вместе с ней разбирается очередной слой
инструментов — от миграций и Swagger до CI/CD и e2e-тестов. Записи выходят на
трёх площадках, а развёрнутые описания с таймкодами — на сайте автора.

| Часть                    | О чём                                                                                                                              | Смотреть                                                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Создание проекта**  | NestJS + Angular без монорепо, Docker Compose и PostgreSQL, Prisma-миграции, health-check, SSE, версионирование API, туннель и PM2 | [YouTube](https://youtu.be/1MSIm8Te-QY) · [Rutube](https://rutube.ru/video/5f0217394026e166e7a224fc12f5c748/) · [VK Видео](https://vkvideo.ru/video-241775994_456239017) · [таймкоды](https://site15.ru/videos/part-1.html) |
| **2. Тестирование с AI** | Unit, интеграционные и e2e-тесты, Swagger/OpenAPI, генерация SDK через HeyAPI, постепенная генерация кода LLM                      | [YouTube](https://youtu.be/6pSWtGoyS6I) · [Rutube](https://rutube.ru/video/c70facc53f796801d96b6850f360a618/) · [VK Видео](https://vkvideo.ru/video-241775994_456239022) · [таймкоды](https://site15.ru/videos/part-2.html) |
| **3. CI/CD с AI**        | GitHub Actions для бэкенда и фронтенда, линты и сборки, JUnit-отчёты, MCP для GitHub, скилл онбординга коммитов                    | [YouTube](https://youtu.be/-VUl5p5xe3I) · [Rutube](https://rutube.ru/video/8af7bfb3b9e759ca6732dbc8011293d9/) · [VK Видео](https://vkvideo.ru/video-241775994_456239023) · [таймкоды](https://site15.ru/videos/part-3.html) |
| **4. Прод с AI**         | `start:prod`, логи PM2, фронтенд внутри бэкенда через ServeStatic, e2e-workflow с выбором веток бэкенда и фронтенда                | [YouTube](https://youtu.be/ceL0qmeQe84) · [Rutube](https://rutube.ru/video/70858b2775dffb17c2e9c203937788ea/) · [VK Видео](https://vkvideo.ru/video-241775994_456239038) · [таймкоды](https://site15.ru/videos/part-4.html) |

Отдельная линия серии — **как работать с кодом, который пишет AI**: постановка
задачи, проверка сгенерированного, движение от простого к сложному и разбор
изменений на небольшие логичные коммиты.

## ✨ Возможности

| Блок               | Что уже работает                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Аутентификация** | Регистрация USER-аккаунта, профиль по API-ключу (`/auth/me`), пароли — `scrypt` из `node:crypto`                      |
| **API-ключи**      | Выпуск (секрет показывается один раз), переименование, включение/отключение, продление, отзыв; чужие ключи недоступны |
| **Роли**           | `USER`, `ADMIN`, `GUEST`; админ-эндпоинты закрыты `AdminGuard`                                                        |
| **Админ-панель**   | Список аккаунтов с ключами, деактивация, смена роли, удаление аккаунта с каскадом ключей                              |
| **Мониторинг**     | Health-check: статус и задержка БД, память, CPU, счётчики пользователей и ключей                                      |
| **Реальное время** | SSE-поток времени сервера и обновление дашборда без перезагрузки                                                      |
| **Контракт API**   | Swagger UI на `/swagger`, `swagger.json` при старте, SDK из OpenAPI для e2e                                           |
| **Инфраструктура** | PostgreSQL + MinIO в Docker Compose, Prisma-миграции, PM2, раздача фронтенда бэкендом в prod                          |
| **CI/CD**          | GitHub Actions: линт, сборка и unit-тесты; ручной e2e-прогон прод-стека с отчётами                                    |
| **AI-инструменты** | Проектные MCP-серверы, skills для агента, генерация тестов и кода                                                     |

## 🧱 Технологии

| Слой               | Стек                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| **Backend**        | NestJS 12, TypeScript 6, Prisma 7 (ESM), PostgreSQL 18 + pgvector, Swagger/OpenAPI                  |
| **Frontend**       | Angular 19, RxJS, SSR-сборка с prerender и hydration, Jest, Playwright                              |
| **Инфраструктура** | Docker Compose (PostgreSQL, MinIO), PM2, GitHub Actions, tuna.am                                    |
| **AI-разработка**  | Qoder IDE, MCP (postgres, github, minio-storage, playwright, context7, sequential-thinking), skills |
| **Качество**       | Vitest + JUnit (backend), Jest + Playwright (frontend), Oxlint, Prettier, Husky                     |

## 🏗 Архитектура

```text
Angular SPA ──HTTP──▶ /api/v1 (NestJS) ──Prisma──▶ PostgreSQL 18 (pgvector)
     ▲                       │
     └────── SSE /time/stream┘
```

- **Backend** — NestJS: URI-версионирование `/api/v1`, Swagger, guards (`x-api-key`, роль `ADMIN`), сервисы и Prisma; при старте пишет `backend/swagger.json`.
- **Frontend** — Angular с дашбордом; в dev ходит в API через прокси `/api` (`frontend/proxy.conf.json`).
- **Dev** — backend `:3000`, `ng serve` `:4200` и tuna-туннель под управлением PM2.
- **Prod** — бэкенд раздаёт собранный фронтенд через `ServeStaticModule`: приложение, API и Swagger живут на одном порту `:3000`.
- **Контракт** — DTO со Swagger-декораторами → `swagger.json` → типизированный SDK (`@hey-api/openapi-ts`) → e2e-тесты.

## 📦 Структура проекта

```
kaufman-bot/
├── .mcp.json               # Проектные MCP-серверы (Qoder, Claude Code, Cursor)
├── .gitmodules             # Маппинг gitlink'а opwork/ на URL (без него любые
│                           # `git submodule …` падают с exit 128)
├── .agents/skills/         # Skills для AI-агента: контракт API, миграции, коммиты, README
├── .github/workflows/
│   ├── ci.yml              # Линт + сборка + unit-тесты backend/frontend на push в main
│   └── e2e-prod.yml        # Ручной прогон: start:prod + e2e фронта и бэка + stop:prod
├── .vscode/                # VS Code конфигурация
│   ├── extensions.json     # Рекомендуемые расширения
│   ├── settings.json       # Настройки редактора + MCP-серверы (для VS Code)
│   ├── launch.json         # Конфигурации отладки
│   └── tasks.json          # Задачи сборки/тестирования
├── backend/              # NestJS backend
│   ├── client/           # Собранный frontend для prod (ng build, в .gitignore)
│   ├── prisma/
│   │   ├── schema.prisma # Схема базы данных
│   │   └── migrations/   # Prisma-миграции
│   ├── src/
│   │   ├── constants/    # Общие константы (X_API_KEY)
│   │   ├── controllers/  # REST-контроллеры (time, health, auth, api-keys, admin)
│   │   ├── dto/          # DTO-классы со Swagger-декораторами
│   │   ├── guards/       # ApiKeyGuard (x-api-key) и AdminGuard (роль ADMIN)
│   │   ├── interfaces/   # SseMessageEvent и др. типы
│   │   ├── services/     # AuthService, UsersService, ApiKeysService
│   │   ├── utils/        # Хелперы (хеширование, генерация ключей и т.п.)
│   │   ├── prisma/       # PrismaService и PrismaModule
│   │   ├── seed/         # Seed-сервисы (начальные данные)
│   │   ├── generated/    # Сгенерированный Prisma Client (в .gitignore)
│   │   └── main.ts       # Точка входа (Swagger + swagger.json)
│   ├── test/
│   │   ├── generated/    # OpenAPI SDK для e2e-тестов (npm run generate:openapi-ts)
│   │   ├── utils/        # ActivityHelper, HTTP-фикстуры, проверка доступности backend
│   │   └── *.e2e-spec.ts # E2E-тесты (бьют в уже запущенный backend)
│   ├── openapi-ts.config.ts  # Генерация SDK из swagger.json
│   └── package.json
├── frontend/             # Angular frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── dashboard.service.ts  # Сервис дашборда
│   │   │   └── app.component.ts      # Главный компонент
│   │   └── proxy.conf.json  # Прокси /api на backend
│   ├── e2e/                # Playwright-спеки (e2e против живого прод-стека)
│   ├── playwright.config.ts # Конфиг Playwright + JUnit-отчёт в test-results/
│   ├── jest.config.js      # Конфиг Jest + jest-junit отчёт
│   └── package.json
├── docker-compose.yml    # PostgreSQL + MinIO
├── ecosystem.config.cjs  # PM2 config для dev
├── ecosystem-prod.config.cjs  # PM2 config для prod
├── start-dev.sh          # Скрипт запуска dev
├── stop-dev.sh           # Скрипт остановки dev
├── start-prod.sh         # Скрипт запуска prod
├── stop-prod.sh          # Скрипт остановки prod
├── opwork/               # Справочный проект: gitlink на site15/opwork, в .gitignore;
│                         # инициализируется только по запросу (`git submodule update
│                         # --init opwork`), CI его не трогает
└── package.json          # Корневые скрипты
```

---

## 🚀 Быстрый старт

### Требования

- Node.js 24+ (см. `.nvmrc`)
- Docker и Docker Compose
- npm
- VS Code (рекомендуется); для AI-workflow подойдёт любая IDE с поддержкой MCP,
  включая Qoder IDE, в которой записана серия

### 1. Клонирование и установка

```bash
git clone git@github.com:kaufman-bot/kaufman-bot.git
cd kaufman-bot
npm run install:all

# Prisma читает DATABASE_URL из backend/.env даже при генерации клиента
cp backend/.env.example backend/.env

# Prisma Client создаётся локально и нужен для сборки backend
cd backend && npm run generate:prisma && cd ..
```

SDK для e2e-тестов генерируется из `swagger.json`, который backend пишет при
старте: после первого `npm run start:dev` выполните
`cd backend && npm run generate:openapi-ts`.

### 2. Открыть в VS Code

```bash
code kaufman-bot.code-workspace
```

VS Code автоматически:

- предложит установить рекомендуемые расширения (нажми **Install All**)
- подхватит настройки редактора, форматтера, MCP-серверов
- загрузит конфигурации отладки и задач

### 3. Запуск dev-окружения

```bash
npm run start:dev
```

Скрипт выполнит:

1. Создание `backend/.env` из `.env.example` (если отсутствует)
2. Запуск PostgreSQL и MinIO в Docker
3. Ожидание healthcheck обоих сервисов
4. Применение Prisma-миграций
5. Запуск backend (порт 3000), frontend (порт 4200) и tuna-туннеля через PM2

### 4. Проверка MCP

После запуска инфраструктуры MCP-серверы автоматически подключаются к локальным сервисам:

| MCP-сервер            | Подключение                  | Статус                                |
| --------------------- | ---------------------------- | ------------------------------------- |
| `postgres`            | `localhost:5432/kaufman_bot` | ✅ готов после `docker compose up -d` |
| `minio-storage`       | `localhost:29000`            | ✅ готов после `docker compose up -d` |
| `github`              | GitHub API через Docker      | ✅ готов после `gh auth login`        |
| `context7`            | интернет                     | ✅ всегда доступен                    |
| `sequential-thinking` | —                            | ✅ всегда доступен                    |
| `playwright`          | —                            | ✅ всегда доступен                    |

### Переменные окружения

Файл `backend/.env` создаётся автоматически из `backend/.env.example` при первом запуске. Содержимое:

```env
DATABASE_URL="postgresql://kaufman:kaufman@localhost:5432/kaufman_bot?schema=public"
PORT=3000

# Default admin credentials
ADMIN_EMAIL=admin@kaufman.bot
ADMIN_PASSWORD=change-me
ADMIN_API_KEY=change-me

# MinIO / S3-compatible object storage
MINIO_ENDPOINT=localhost
MINIO_PORT=29000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_USE_SSL=false
```

---

## 🛠 Запуск и остановка

### Dev-режим (разработка)

**Запуск:**

```bash
npm run start:dev
# или
./start-dev.sh
```

Скрипт выполнит:

1. Создание `backend/.env` из `.env.example` (если отсутствует)
2. Запуск PostgreSQL (образ `pgvector/pgvector:pg18`) и MinIO через `docker compose up -d`
3. Ожидание healthcheck обоих сервисов
4. Применение Prisma-миграций
5. Запуск backend (порт 3000), frontend (порт 4200) и tuna-туннеля через PM2

**Остановка:**

```bash
npm run stop:dev
# или
./stop-dev.sh
```

Останавливает все PM2-процессы и Docker-контейнеры.

**Доступ:**

- Frontend: http://localhost:4200
- Backend API: http://localhost:3000/api/v1
- Туннель: публичный адрес выдаёт tuna при старте (см. `npx pm2 logs kaufman-bot-tunnel`); dev-сервер разрешает хосты `*.ru.tuna.am` и `*.2na.am`

### Prod-режим (продакшен)

**Запуск:**

```bash
npm run start:prod
# или
./start-prod.sh
```

Скрипт выполнит:

1. Создание `backend/.env` из `.env.example` (если отсутствует)
2. Сборку frontend (`npm run build`)
3. Сборку backend (`npm run build`)
4. Запуск PostgreSQL и MinIO в Docker
5. Ожидание healthcheck базы данных
6. Применение Prisma-миграций
7. Запуск backend в cluster mode через PM2 (с ограничением памяти 1GB)

После запуска backend сам раздаёт собранный фронтенд как статику
(`@nestjs/serve-static`, путь `backend/client/browser`): фронтенд,
API и Swagger UI работают на одном порту 3000. Отдельный сервер для фронта в
prod не нужен; Angular SSR-сервер не запускается — страницы отдаются
пререндеренными и гидрируются на клиенте.

В dev-режиме (`npm run start:dev`) `ServeStaticModule` не подключается —
фронтенд живёт на отдельном dev-сервере Angular (порт 4200) с прокси `/api`
на backend. Статика раздаётся только при `NODE_ENV=production`.

**Доступ (prod):**

- Frontend: http://localhost:3000 (статика из `backend/client/browser`)
- Backend API: http://localhost:3000/api/v1
- Swagger UI: http://localhost:3000/swagger

**Остановка:**

```bash
npm run stop:prod
# или
./stop-prod.sh
```

---

## 🔧 API

Backend использует URI-версионирование. Все эндпоинты начинаются с `/api/v1/`.

### Основные эндпоинты

| Метод  | Путь                       | Описание                                                            |
| ------ | -------------------------- | ------------------------------------------------------------------- |
| GET    | `/api/v1/time`             | Текущее время сервера (JSON)                                        |
| GET    | `/api/v1/time/stream`      | SSE-поток с обновлением времени каждую секунду                      |
| GET    | `/api/v1/health`           | Проверка состояния системы (БД, память, CPU, статистика)            |
| POST   | `/api/v1/auth/register`    | Регистрация USER-аккаунта, выдаёт первый API-ключ (секрет один раз) |
| GET    | `/api/v1/auth/me`          | Профиль пользователя за предъявленным API-ключом                    |
| GET    | `/api/v1/api-keys`         | Список ключей текущего аккаунта (секреты замаскированы)             |
| POST   | `/api/v1/api-keys`         | Выпустить новый ключ для текущего аккаунта                          |
| PATCH  | `/api/v1/api-keys/{id}`    | Переименовать / включить-выключить / продлить ключ                  |
| DELETE | `/api/v1/api-keys/{id}`    | Отозвать и удалить ключ                                             |
| GET    | `/api/v1/admin/users`      | Список всех аккаунтов с их ключами (только ADMIN)                   |
| GET    | `/api/v1/admin/users/{id}` | Один аккаунт (только ADMIN)                                         |
| PATCH  | `/api/v1/admin/users/{id}` | Деактивация/активация аккаунта, смена роли (только ADMIN)           |
| DELETE | `/api/v1/admin/users/{id}` | Удаление аккаунта, ключи каскадно (только ADMIN)                    |
| GET    | `/swagger`                 | Swagger UI (без глобального префикса `/api`)                        |

Эндпоинты времени и здоровья публичные; `auth/me`, `api-keys/*` защищены
`ApiKeyGuard`, а `admin/users/*` дополнительно `AdminGuard` (роль `ADMIN`,
иначе `403`). На защищённых эндпоинтах ключ передаётся заголовком `x-api-key`
или параметром `?apiKey=` (для клиентов вроде `EventSource`, которые не могут
задать заголовок); заголовок имеет приоритет. У публичных `/time`,
`/time/stream` и `/health` параметра `apiKey` в контракте нет вовсе. Секрет
ключа показывается только в ответе создания — в остальных чтениях он
маскируется (`sk-3f9c1…`).

### Примеры запросов

**Получить время сервера:**

```bash
curl http://localhost:3000/api/v1/time
```

**Проверить API-ключ:**

```bash
curl -H "x-api-key: $ADMIN_API_KEY" http://localhost:3000/api/v1/auth/me
```

**Зарегистрировать аккаунт (в ответе — первый API-ключ):**

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "content-type: application/json" \
  -d '{ "email": "user@example.com", "password": "super-secret-123" }'
```

**Выпустить и отозвать ключ:**

```bash
curl -X POST http://localhost:3000/api/v1/api-keys \
  -H "x-api-key: sk-..." -H "content-type: application/json" \
  -d '{ "name": "CI pipeline", "expiresAt": "2026-12-31T23:59:59.000Z" }'

curl -X DELETE http://localhost:3000/api/v1/api-keys/<id> -H "x-api-key: sk-..."
```

**Админ-операции (ключ аккаунта с ролью ADMIN):**

```bash
curl -H "x-api-key: $ADMIN_API_KEY" http://localhost:3000/api/v1/admin/users
curl -X PATCH http://localhost:3000/api/v1/admin/users/<id> \
  -H "x-api-key: $ADMIN_API_KEY" -H "content-type: application/json" \
  -d '{ "isActive": false }'
```

**Health check:**

```bash
curl http://localhost:3000/api/v1/health
```

Ответ содержит:

- Статус БД (connected/disconnected, latency)
- Статистику (количество пользователей и API-ключей)
- Информацию о сервере (hostname, platform, CPU, memory)

---

## 🗄 База данных

### PostgreSQL с pgvector

Проект использует образ `pgvector/pgvector:pg18` с поддержкой векторных типов данных для AI/ML задач.

**Параметры подключения:**

- Host: `localhost`
- Port: `5432`
- Database: `kaufman_bot`
- User: `kaufman`
- Password: `kaufman`

**Том данных:** `<repo-dir>_kaufman_bot_postgres_volume` (монтируется в `/var/lib/postgresql`;
префикс — имя compose-проекта, то есть имя каталога репозитория)

### MinIO (S3-совместимое хранилище)

Проект включает MinIO как S3-совместимое хранилище: сервис поднимается
`docker compose up -d` и подключается из MCP `minio-storage`, но бэкенд пока
не пишет в него (в `backend/src` нет S3-клиента и `MINIO_*` переменных).

**Образ:** `docker.io/bitnamilegacy/minio:2025.7.23-debian-12-r0`. Официальные
образы MinIO (`minio/minio` на Docker Hub и quay.io) сняты с публичной раздачи —
анонимный pull даёт `pull access denied`, из-за чего `npm run start:prod` падал
на `docker compose up -d` на чистом раннере. Взята последняя общедоступная
(в том числе анонимно) сборка того же `minio` из legacy-каталога Bitnami —
обратите внимание: её тег `latest` завис на 2025.5.24, поэтому фиксируем явный
`2025.7.23-debian-12-r0`. Образ по умолчанию работает под uid 1001, а том
`/data` записан root'ом, поэтому в compose явно указан `user: root` (иначе
`file access denied` при инициализации `.minio.sys`).

⚠️ Локальный том, созданный более новым официальным билдом (например
`RELEASE.2025-09-07`), при пересоздании контейнера на 2025.7.23 может быть
отклонён как «из будущей версии». Пока бэкенд в MinIO ничего не пишет, это
некритично: поможет пересоздание тома (`docker compose down` +
`docker volume rm <repo-dir>_kaufman_bot_minio_volume`). Действующий
контейнер с закэшированным старым образом продолжает работать как раньше —
смена образа применяется только при следующем `docker compose up -d`.

**Параметры подключения:**

- S3 API: `localhost:29000`
- Web Console: http://localhost:29001
- Login: `minioadmin` / `minioadmin123`

**Том данных:** `<repo-dir>_kaufman_bot_minio_volume` (монтируется в `/data`)

### Prisma ORM

Проект использует Prisma 7+ с ESM-модулями.

**Основные команды:**

```bash
# Генерация SDK для тестов + Prisma Client
npm run generate

# Только Prisma Client
npm run generate:prisma

# Применение миграций
npm run prisma:migrate

# Создание новой миграции
npm run prisma:create -- migration_name

# Сброс базы данных
npm run prisma:reset
```

**Важно:** Все изменения схемы БД выполняются только через Prisma-миграции. Запрещено использовать `prisma db push` или raw SQL.

---

## 🎨 VS Code расширения

Проект рекомендует следующие расширения для VS Code (см. `.vscode/extensions.json`):

### Angular

- **angular.ng-template** — Angular language service
- **johnpapa.angular2** — Angular snippets

### NestJS

- **nestjs.snippets** — NestJS snippets

### Prisma

- **prisma.prisma** — Prisma language support

### TypeScript

- **dbaeumer.vscode-typescript** — TypeScript validation

### Formatter / Linter

- **esbenp.prettier-vscode** — Prettier formatter
- **oxc.oxc-vscode** — Oxlint (быстрый линтер)

### Testing

- **vitest.explorer** — Vitest test explorer
- **ms-playwright.playwright** — Playwright для E2E-тестов

### Docker

- **ms-azuretools.vscode-docker** — Docker tools

### Database

- **mtxr.sqltools** — SQL client
- **mtxr.sqltools-driver-pg** — PostgreSQL driver для SQLTools

### Git

- **eamodio.gitlens** — Git supercharged

### Editor helpers

- **editorconfig.editorconfig** — EditorConfig support
- **christian-kohler.path-intellisense** — Autocomplete filenames
- **christian-kohler.npm-intellisense** — Autocomplete npm packages
- **usernamehw.errorlens** — Highlight errors inline
- **yoavbls.pretty-ts-errors** — Better TypeScript errors

### PM2

- **june07.pm2-explorer** — PM2 process manager UI

**Установка всех рекомендованных расширений:**

```bash
code --install-extension angular.ng-template
code --install-extension johnpapa.angular2
code --install-extension nestjs.snippets
code --install-extension prisma.prisma
# ... и так далее для всех расширений из .vscode/extensions.json
```

---

## 🤖 MCP (Model Context Protocol) серверы

Проект интегрирован с MCP-серверами для расширения возможностей AI-ассистента.

**Где хранится конфигурация:**

- `.mcp.json` (корень проекта) — для Qoder, Claude Code и Cursor; при первом открытии проекта Qoder запросит подтверждение проектных MCP-серверов
- `.vscode/settings.json` (блок `mcp`) — для VS Code

Серверы `browser-use` и `genui` встроены в IDE (уровень пользователя) и в конфигурации проекта не нуждаются.

### Доступные MCP-серверы

#### 1. **postgres** — Работа с PostgreSQL

Позволяет AI-ассистенту выполнять SQL-запросы к базе данных для отладки и анализа.

**Возможности:**

- Выполнение SELECT-запросов
- Просмотр структуры таблиц
- Анализ данных

**Пример использования:**

```
Попроси AI: "Покажи всех пользователей из базы данных"
AI выполнит: SELECT * FROM users LIMIT 10;
```

**Важно:** MCP-доступ только для чтения. Все изменения БД выполняются через Prisma-миграции.

#### 2. **minio-storage** — Объектное хранилище MinIO

Управление файлами в MinIO (S3-совместимое хранилище). Подключается к локальному MinIO из docker-compose.

**Параметры подключения:**

- Endpoint: `localhost:29000`
- Access Key: `minioadmin`
- Secret Key: `minioadmin123`
- Console: http://localhost:29001

**Возможности:**

- Загрузка/скачивание файлов
- Управление бакетами
- Генерация presigned URLs

#### 3. **playwright** — Браузерная автоматизация

Автоматизированное тестирование UI через браузер.

**Возможности:**

- Открытие страниц
- Клик по элементам
- Заполнение форм
- Скриншоты
- E2E-тестирование

#### 4. **browser-use** — Управление браузером

Высокоуровневые операции с браузером.

**Возможности:**

- Навигация по страницам
- Скриншоты
- Взаимодействие с DOM

#### 5. **context7** — Контекстная документация

Доступ к документации библиотек и фреймворков.

**Возможности:**

- Поиск по документации
- Получение примеров кода
- Resolve library IDs

#### 6. **genui** — Генерация UI

Создание UI-компонентов и виджетов.

**Возможности:**

- Показ виджетов
- Загрузка гайдлайнов

#### 7. **sequential-thinking** — Последовательное мышление

Инструмент для структурированного решения сложных задач.

**Возможности:**

- Декомпозиция задач
- Пошаговое решение
- Анализ проблем

#### 8. **github** — GitHub API

Официальный GitHub MCP Server (`ghcr.io/github/github-mcp-server`, запускается в Docker) для работы с репозиторием из AI-ассистента.

**Возможности:**

- Репозитории, ветки, файлы и коммиты (`search_repositories`, `get_file_contents`, `create_branch`, `push_files`)
- Issues: поиск, комментарии, обновления (`search_issues`, `list_issues`, `add_issue_comment`)
- Pull requests: создание, ревью, мерж (`create_pull_request`, `merge_pull_request`)
- GitHub Actions: статусы запусков, логи джобов, триггер воркфлоу (`actions_list`, `get_job_logs`, `actions_run_trigger`)
- Уведомления (`list_notifications`, `dismiss_notification`)

**Токен доступа** берётся из переменной окружения `GITHUB_PERSONAL_ACCESS_TOKEN`, а если она не задана — из GitHub CLI:

```bash
gh auth login   # однократная авторизация; проверить: gh auth status
```

Токен в репозитории не хранится.

### Проектные skills

В `.agents/skills/` лежат правила, которые агент применяет при работе с кодом:

| Skill                    | Что задаёт                                                                        |
| ------------------------ | --------------------------------------------------------------------------------- |
| `controller-dto-swagger` | Каждый handler принимает и возвращает DTO-классы со Swagger-декораторами          |
| `prisma-migrations-only` | Схема БД меняется только через Prisma-миграции, без `db push` и raw SQL           |
| `git-onboarding-commit`  | Пересборка изменений в последовательность коммитов, удобную для ревью             |
| `readme-auto-update`     | README синхронизируется с изменениями структуры, конфигурации и поведения проекта |

### Как использовать MCP

MCP-серверы автоматически доступны AI-ассистенту при работе с проектом. Просто опишите задачу на естественном языке:

**Примеры:**

- "Покажи последние 10 пользователей из базы"
- "Сделай скриншот главной страницы"
- "Загрузи файл в MinIO"
- "Проверь состояние API через браузер"
- "Покажи упавшие шаги в последнем запуске GitHub Actions"

---

## 📝 NPM-скрипты

### Корневые скрипты

| Команда                           | Описание                                  |
| --------------------------------- | ----------------------------------------- |
| `npm run install:all`             | Установка зависимостей backend и frontend |
| `npm run start:dev`               | Запуск dev-окружения                      |
| `npm run stop:dev`                | Остановка dev-окружения                   |
| `npm run start:prod`              | Запуск prod-окружения                     |
| `npm run stop:prod`               | Остановка prod-окружения                  |
| `npm run format`                  | Форматирование backend и frontend         |
| `npm run generate`                | Генерация OpenAPI SDK + Prisma Client     |
| `npm run prisma:migrate`          | Применение миграций                       |
| `npm run prisma:create -- <name>` | Создание новой миграции                   |
| `npm run prisma:reset`            | Сброс базы данных                         |

### Backend скрипты

| Команда                       | Описание                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `npm run build`               | Сборка backend                                                                         |
| `npm run start`               | Запуск backend                                                                         |
| `npm run start:dev`           | Запуск backend в dev-режиме с watch                                                    |
| `npm run start:prod`          | Запуск backend в prod-режиме (`NODE_ENV=production`, со статикой собранного фронтенда) |
| `npm run lint`                | Запуск Oxlint                                                                          |
| `npm run test`                | Запуск unit-тестов (Vitest)                                                            |
| `npm run test:e2e`            | E2E-тесты против запущенного backend                                                   |
| `npm run generate`            | `openapi-ts` + `prisma generate`                                                       |
| `npm run generate:openapi-ts` | Генерация SDK для e2e из `swagger.json`                                                |
| `npm run generate:prisma`     | Только генерация Prisma Client                                                         |
| `npm run format`              | Форматирование Prettier                                                                |

### Frontend скрипты

| Команда                    | Описание                                      |
| -------------------------- | --------------------------------------------- |
| `npm run start`            | Запуск Angular dev-server                     |
| `npm run build`            | Сборка frontend                               |
| `npm run watch`            | Сборка в watch-режиме                         |
| `npm run lint`             | Angular ESLint (ng lint)                      |
| `npm run test`             | Unit-тесты (Jest + jest-preset-angular)       |
| `npm run test:e2e`         | E2E-тесты Playwright против запущенного стека |
| `npm run test:e2e:install` | Скачивание браузера Chromium для Playwright   |

---

## 🧪 Тестирование

### Backend (Vitest)

```bash
cd backend
npm run test          # Unit-тесты
npm run test:e2e      # E2E-тесты
npm run test:cov      # Покрытие кода
```

**E2E-тесты не поднимают приложение.** Они работают с реально запущенным
backend (по умолчанию `http://localhost:3000`) через типизированный SDK,
сгенерированный из OpenAPI-спецификации.

Порядок подготовки (выполняется один раз после изменений API):

```bash
cd backend
npm run start:dev                 # backend writes ./swagger.json at boot
npm run generate:openapi-ts       # swagger.json → test/generated/client
npm run test:e2e                  # tests hit the running backend
```

- Адрес backend переопределяется: `E2E_BASE_URL=http://localhost:3001 npm run test:e2e`
- `test/utils/activity-helper.ts` — обёртка над SDK (адаптация утилиты из
  opwork): хранит API-ключ в заголовке `x-api-key` клиента и читает SSE через
  `client.sse.get`. Там же живут HTTP-фикстуры: `ensureBackendRunning()`
  (падает с понятным сообщением, если backend не запущен), `loginAsAdmin()`,
  `registerAccount(email)`, `issueKey(body)`, `removeAccountAsAdmin(id)` и
  статики `adminApiKey()` / `isoFromNow(ms)`
- **Тесты не подключаются к базе.** Все фикстуры готовятся только через HTTP:
  `POST /auth/register` создаёт аккаунт, `POST /api-keys` — ключи с нужными
  свойствами (просроченный, отключённый, с будущим сроком), `PATCH /admin/users/:id`
  деактивирует аккаунт, `DELETE /admin/users/:id` убирает за собой
- `ADMIN_API_KEY` из `backend/.env` (сид-ключ администратора) обязателен для
  teardown; `test/utils/api-result.ts` — чтение `message`/`status` ответов
- `test/generated/client` — сгенерированный SDK; не форматируется Prettier-ом
  (см. `backend/.prettierignore`) и обновляется командой `generate:openapi-ts`

### Frontend (Jest + Playwright)

```bash
cd frontend
npm run test              # Unit-тесты (Jest, jsdom)
npm run test:e2e:install  # один раз: скачать Chromium
npm run test:e2e          # E2E-тесты (Playwright)
```

**E2E-набор тоже ничего не запускает.** `e2e/dashboard.spec.ts` открывает реальный
Chromium на `http://localhost:3000` — туда `npm run start:prod` поднимает backend,
который в prod раздаёт собранный фронтенд (ServeStaticModule). Поэтому перед
прогоном нужен живой стек (`npm run start:prod` из корня). Для dev-цикла
подходит и `ng serve` с прокси `/api`:
`E2E_BASE_URL=http://localhost:4200 npm run test:e2e`.

Проверяется контракт UI и API: отдача собранного фронтенда, `GET /api/v1/health`
(карточки статуса и статистики), `EventSource` на `/api/v1/time/stream`, кнопка
«Обновить по REST» (`GET /api/v1/time`).

### JUnit-отчёты

Оба проекта пишут JUnit XML — их забирает GitHub Actions и публикует как чеки:

| Отчёт                                 | Кто генерирует                          |
| ------------------------------------- | --------------------------------------- |
| `backend/test-results/junit.xml`      | `vitest.config.ts` (unit)               |
| `backend/test-results/e2e-junit.xml`  | `vitest.config.e2e.ts` (e2e)            |
| `frontend/test-results/junit.xml`     | `jest.config.js` (jest-junit)           |
| `frontend/test-results/e2e-junit.xml` | `playwright.config.ts` (reporter junit) |

---

## ⚙ CI/CD на GitHub Actions

### `ci.yml` — автоматически на каждый push в main

Два параллельных джоба: backend (`npm ci` → prisma generate → oxlint → nest build
→ Vitest) и frontend (`npm ci` → ng lint → ng build → Jest).
JUnit-отчёты публикуются шагом `dorny/test-reporter` (`reporter: jest-junit` —
у экшена нет значения `junit`, generic JUnit XML читает парсер jest-junit).

### `e2e-prod.yml` — ручной прогон живого прод-стека

Запускается из вкладки **Actions → E2E Prod → Run workflow**; в форме выбираются
две ветки одного монорепозитория:

| Поле              | Что берётся из ветки                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `backend_branch`  | `backend/` и корневая инфраструктура (docker-compose, ecosystem-prod, start/stop-скрипты) |
| `frontend_branch` | `frontend/`                                                                               |

Шаги джоба (один раннер, поэтому стек живёт внутри одного джоба):

1. checkout `backend_branch` + наложение `frontend/` из `frontend_branch` через
   `git archive` — второй `actions/checkout` на вложенный путь запускает
   `git submodule foreach` и падает (exit 128) на ref'ах, где gitlink `opwork/`
   не описан в `.gitmodules` (старые ветки/теги);
2. `npm ci` обоих проектов, `prisma generate`, `backend/.env` из `.env.example`;
3. `npm run start:prod` — docker compose (PostgreSQL/MinIO) → миграции → сборка
   фронта и бэка → PM2; далее ожидание `GET /api/v1/health`;
4. `npm run test:e2e` в backend (SDK по реальному API) и в frontend (Playwright);
5. публикация обоих JUnit-отчётов в чеки (`dorny/test-reporter`) и загрузка
   артефактов (HTML-отчёт Playwright, трейсы, XML);
6. `npm run stop:prod` — всегда (`if: always()`), даже если тесты упали;
7. финальный шаг красит джоб, если любая из e2e-подводок провалилась.

Прогоны не параллелятся (`concurrency.group: e2e-prod`), потому что занимают
порты 3000/5432/29000 на хосте раннера.

---

## 📐 Форматирование и линтинг

### Prettier

Проект использует Prettier для форматирования. Конфигурации:

- `backend/.prettierrc`
- `frontend/.prettierrc` (если есть)

**Форматирование:**

```bash
npm run format
```

### Oxlint

Backend использует Oxlint — быстрый линтер на Rust.

```bash
cd backend
npm run lint
```

### Husky pre-commit hook

При коммите автоматически запускается форматирование для изменённых файлов backend и frontend.

---

## 🔐 Безопасность

- **Не коммитьте** файл `backend/.env` (содержит секреты)
- Измените `ADMIN_PASSWORD` и `ADMIN_API_KEY` в продакшене
- Защищённые эндпоинты требуют действующий API-ключ (`ApiKeyGuard`): ключ
  проверяется по заголовку `x-api-key`, затем по `?apiKey=`; отключённый или
  просроченный ключ, а также неактивный пользователь дают `401`
- В ответах секрет ключа маскируется (первые 8 символов + `…`)
- `admin/users/*` доступны только роли `ADMIN` (`AdminGuard`, иначе `403`);
  удалить собственный аккаунт нельзя, а ключи другого владельца редактируются
  только им самим (`403`)
- Используйте HTTPS в продакшене
- Регулярно обновляйте зависимости (`npm audit`)

---

## 🐛 Решение проблем

### Ошибка `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`

**Причина:** Отсутствует файл `backend/.env`

**Решение:**

```bash
cp backend/.env.example backend/.env
```

Или просто запустите `npm run start:dev` — скрипт автоматически создаст `.env`.

### Ошибка `ENOTEMPTY` при `npx prisma migrate deploy`

**Причина:** Конфликт кэша npm

**Решение:**

```bash
# Очистите кэш npx
rm -rf ~/.npm/_npx/*
```

### Контейнер PostgreSQL не запускается

**Причина:** Несовместимость с PostgreSQL 18+ при монтировании тома

**Решение:** Убедитесь, что в `docker-compose.yml` том смонтирован в `/var/lib/postgresql` (не в `/var/lib/postgresql/data`), и `PGDATA` установлен в `/var/lib/postgresql/data/pgdata`.

### Frontend dev-server блокирует запросы от tunnel

**Причина:** Angular dev-server блокирует неизвестные хосты

**Решение:** Проверьте `frontend/angular.json` — секция `serve.options.allowedHosts` должна содержать хост туннеля.

### В dev-режиме на http://localhost:3000 открывается страница фронтенда

**Причина:** `NODE_ENV=production` установлен явно или через `.env`

**Решение:** Убедитесь, что `NODE_ENV` не установлен в dev-окружении. В `start:dev` скрипте `NODE_ENV` не задаётся — фронтенд живёт на порту 4200.

---

## 🤝 Участие в проекте

Проект открыт для обсуждения и предложений:

- нашли баг или хотите предложить улучшение — создайте
  [Issue](https://github.com/kaufman-bot/kaufman-bot/issues);
- хотите обсудить решение из видео — пишите в комментариях на любой площадке
  или в Issue;
- перед PR полезно заглянуть в [`.agents/skills/`](.agents/skills) — там правила
  проекта: DTO со Swagger-декораторами, миграции только через Prisma, атомарные
  коммиты и синхронизация README.

---

## 📄 Лицензия

UNLICENSED

---

## 👤 Автор

**Ильшат Хамитов** — fullstack-разработчик, автор видео-серии.

- Сайт и блог: [site15.ru](https://site15.ru)
- GitHub: [github.com/EndyKaufman](https://github.com/EndyKaufman)
- Видео-серия: [site15.ru/#videos](https://site15.ru/#videos)

Вопросы и предложения по проекту — через
[Issues](https://github.com/kaufman-bot/kaufman-bot/issues) в репозитории.
