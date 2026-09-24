# kaufman-bot

Монорепозиторий проекта kaufman-bot: бэкенд на NestJS + фронтенд на Angular + PostgreSQL с pgvector.

## 📋 Описание проекта

**kaufman-bot** — это платформа для управления ботами с API-ключами. Проект предоставляет:

- REST API для управления пользователями и API-ключами
- Административную панель для мониторинга состояния системы
- Систему ролей (USER, ADMIN, GUEST)
- SSE (Server-Sent Events) для получения обновлений в реальном времени

### Бизнес-логика

**Модель данных:**

- **User** — пользователь системы (email, пароль, роль, статус активности)
- **ApiKey** — API-ключи для доступа к ботам (привязаны к пользователю, с сроком действия)

**Основные возможности:**

- Регистрация и аутентификация пользователей
- Генерация и управление API-ключами
- Мониторинг состояния системы (health check)
- Административная панель с дашбордом

---

## 🚀 Быстрый старт

### Требования

- Node.js 24+ (см. `.nvmrc`)
- Docker и Docker Compose
- npm
- VS Code (рекомендуется)

### 1. Клонирование и установка

```bash
git clone <repo-url> && cd new-kaufman-bot
npm run install:all
```

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
| `postgres-kaufman`    | `localhost:5432/kaufman_bot` | ✅ готов после `docker compose up -d` |
| `minio-storage`       | `localhost:29000`            | ✅ готов после `docker compose up -d` |
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

## 🛠 Остановка

### Dev-режим (разработка)

**Запуск:**

```bash
npm run start:dev
# или
./start-dev.sh
```

Скрипт выполнит:

1. Создание `backend/.env` из `.env.example` (если отсутствует)
2. Запуск PostgreSQL в Docker (образ `pgvector/pgvector:pg18`)
3. Ожидание healthcheck базы данных
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
- Туннель: `kaufman-bot.tuna.io` (проксирует на порт 4200)

### Prod-режим (продакшен)

**Запуск:**

```bash
npm run start:prod
# или
./start-prod.sh
```

Скрипт выполнит:

1. Создание `backend/.env` из `.env.example` (если отсутствует)
2. Запуск PostgreSQL в Docker
3. Ожидание healthcheck базы данных
4. Сборку frontend (`npm run build`)
5. Применение Prisma-миграций
6. Сборку backend (`npm run build`)
7. Запуск backend в cluster mode через PM2 (с ограничением памяти 1GB)

**Остановка:**

```bash
npm run stop:prod
# или
./stop-prod.sh
```

---

## 📦 Структура проекта

```
new-kaufman-bot/
├── .vscode/                # VS Code конфигурация
│   ├── extensions.json     # Рекомендуемые расширения
│   ├── settings.json       # Настройки редактора + MCP-серверы
│   ├── launch.json         # Конфигурации отладки
│   └── tasks.json          # Задачи сборки/тестирования
├── backend/              # NestJS backend
│   ├── prisma/
│   │   ├── schema.prisma # Схема базы данных
│   │   └── migrations/   # Prisma-миграции
│   ├── src/
│   │   ├── controllers/  # REST-контроллеры
│   │   ├── prisma/       # PrismaService и PrismaModule
│   │   ├── seed/         # Seed-сервисы (начальные данные)
│   │   ├── generated/    # Сгенерированный Prisma Client
│   │   └── main.ts       # Точка входа
│   └── package.json
├── frontend/             # Angular frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── dashboard.service.ts  # Сервис дашборда
│   │   │   └── app.component.ts      # Главный компонент
│   │   └── proxy.conf.json  # Прокси /api на backend
│   └── package.json
├── docker-compose.yml    # PostgreSQL + MinIO
├── ecosystem.config.cjs  # PM2 config для dev
├── ecosystem-prod.config.cjs  # PM2 config для prod
├── start-dev.sh          # Скрипт запуска dev
├── stop-dev.sh           # Скрипт остановки dev
├── start-prod.sh         # Скрипт запуска prod
├── stop-prod.sh          # Скрипт остановки prod
└── package.json          # Корневые скрипты
```

---

## 🔧 API Endpoints

Backend использует URI-версионирование. Все эндпоинты начинаются с `/api/v1/`.

### Основные эндпоинты

| Метод | Путь                  | Описание                                                 |
| ----- | --------------------- | -------------------------------------------------------- |
| GET   | `/api/v1`             | Приветственное сообщение                                 |
| GET   | `/api/v1/time`        | Текущее время сервера (JSON)                             |
| GET   | `/api/v1/time/stream` | SSE-поток с обновлением времени каждую секунду           |
| GET   | `/api/v1/health`      | Проверка состояния системы (БД, память, CPU, статистика) |

### Примеры запросов

**Получить время сервера:**

```bash
curl http://localhost:3000/api/v1/time
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

**Том данных:** `kaufman_bot_postgres_volume` (монтируется в `/var/lib/postgresql`)

### MinIO (S3-совместимое хранилище)

Проект включает MinIO для хранения файлов и медиа-объектов.

**Параметры подключения:**

- S3 API: `localhost:29000`
- Web Console: http://localhost:29001
- Login: `minioadmin` / `minioadmin123`

**Том данных:** `kaufman_bot_minio_volume`

### Prisma ORM

Проект использует Prisma 7+ с ESM-модулями.

**Основные команды:**

```bash
# Генерация Prisma Client
npm run generate

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

### Как использовать MCP

MCP-серверы автоматически доступны AI-ассистенту при работе с проектом. Просто опишите задачу на естественном языке:

**Примеры:**

- "Покажи последние 10 пользователей из базы"
- "Сделай скриншот главной страницы"
- "Загрузи файл в MinIO"
- "Проверь состояние API через браузер"

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
| `npm run generate`                | Генерация Prisma Client                   |
| `npm run prisma:migrate`          | Применение миграций                       |
| `npm run prisma:create -- <name>` | Создание новой миграции                   |
| `npm run prisma:reset`            | Сброс базы данных                         |

### Backend скрипты

| Команда              | Описание                            |
| -------------------- | ----------------------------------- |
| `npm run build`      | Сборка backend                      |
| `npm run start`      | Запуск backend                      |
| `npm run start:dev`  | Запуск backend в dev-режиме с watch |
| `npm run start:prod` | Запуск backend в prod-режиме        |
| `npm run lint`       | Запуск Oxlint                       |
| `npm run test`       | Запуск unit-тестов (Vitest)         |
| `npm run test:e2e`   | Запуск E2E-тестов                   |
| `npm run format`     | Форматирование Prettier             |

### Frontend скрипты

| Команда         | Описание                        |
| --------------- | ------------------------------- |
| `npm run start` | Запуск Angular dev-server       |
| `npm run build` | Сборка frontend                 |
| `npm run watch` | Сборка в watch-режиме           |
| `npm run test`  | Запуск тестов (Karma + Jasmine) |

---

## 🧪 Тестирование

### Backend (Vitest)

```bash
cd backend
npm run test          # Unit-тесты
npm run test:e2e      # E2E-тесты
npm run test:cov      # Покрытие кода
```

### Frontend (Karma + Jasmine)

```bash
cd frontend
npm run test
```

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
- Используйте HTTPS в продакшене
- Регулярно обновляйте зависимости (`npm audit`)

---

## 📚 Технологии

### Backend

- **NestJS 12** — Node.js framework
- **Prisma 7** — ORM с типобезопасностью
- **PostgreSQL 18** — Реляционная БД
- **pgvector** — Векторные типы для AI/ML
- **Vitest** — Unit/E2E тестирование
- **Oxlint** — Линтер
- **Prettier** — Форматирование

### Frontend

- **Angular 19** — TypeScript framework
- **RxJS** — Reactive extensions
- **Angular SSR** — Server-side rendering
- **Karma + Jasmine** — Тестирование

### Инфраструктура

- **Docker** — Контейнеризация
- **PM2** — Process manager
- **Tuna** — Туннель для dev-окружения
- **PostgreSQL 18 + pgvector** — Реляционная БД с векторными типами
- **MinIO** — S3-совместимое объектное хранилище

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

---

## 📄 Лицензия

UNLICENSED

---

## 👥 Контакты

Если у вас есть вопросы или предложения, создайте Issue в репозитории.
