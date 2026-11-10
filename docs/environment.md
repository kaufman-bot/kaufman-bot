# Окружение и инфраструктура

Всё, что нужно для запуска, отладки и развертывания проекта. Факты в этом
документе проверяемы по файлам в репозитории; ссылки — в конце раздела.

## 1. Требования к машине

| Инструмент              | Версия                              | Зачем                                            |
| ----------------------- | ----------------------------------- | ------------------------------------------------ |
| Node.js                 | **24+** (см. [`.nvmrc`](../.nvmrc)) | Nest 12, Angular 19, Prisma 7, `node --env-file` |
| npm                     | идёт с Node 24                      | install / scripts                                |
| Docker + Docker Compose | v2 (compose-plugin)                 | PostgreSQL, MinIO                                |
| PM2                     | ставится через `npx -y pm2`         | запуск dev/prod-сервисов                         |
| Git                     | ≥ 2.40                              | сабмодуль `opwork/`                              |
| VS Code (опционально)   | любой свежий                        | рекомендуемые расширения в `.vscode/`            |

Секретов в дереве нет: `backend/.env` в gitignore, `ADMIN_API_KEY` /
`USER{1,2}_API_KEY` в `.env.example` — это **заглушки**, их нужно менять
локально.

## 2. Порты

| Сервис              | Порт    | Хост                       | Примечание                                                        |
| ------------------- | ------- | -------------------------- | ----------------------------------------------------------------- |
| Backend (Nest)      | `3000`  | `process.env.PORT ?? 3000` | `/api/v1/*`, `/swagger`; в dev — только API, в prod + SPA         |
| Frontend `ng serve` | `4200`  | `frontend/angular.json`    | dev; проксирует `/api` → `:3000` через `proxy.conf.json`          |
| PostgreSQL          | `5432`  | `docker-compose.yml`       | пользователь/пароль/БД: `kaufman`/`kaufman`/`kaufman_bot`         |
| MinIO S3 API        | `29000` | `docker-compose.yml`       | внешнее; внутреннее `9000`. MCP `minio-storage` подключается сюда |
| MinIO Console       | `29001` | `docker-compose.yml`       | внешнее; внутреннее `9001`. Логин `minioadmin`/`minioadmin123`    |
| tuna-туннель (dev)  | —       | `ecosystem.config.cjs`     | `tuna http 4200` — публичный URL на dev-фронт                     |

**Проверка**: `ss -ltnp | grep -E '3000|4200|5432|29000|29001'`.

## 3. Переменные окружения (`backend/.env`)

Файл **обязателен** — без него Prisma CLI (`prisma.config.ts` через
`import 'dotenv/config'`) падает с `PrismaConfigEnvError: Cannot resolve
environment variable: DATABASE_URL`. `start-dev.sh` и `start-prod.sh`
создают `.env` из шаблона, если его нет.

| Переменная                                                                                  | Дефолт из `.env.example`                                                | Consumers                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                              | `postgresql://kaufman:kaufman@localhost:5432/kaufman_bot?schema=public` | `PrismaService` (конструктор), `prisma.config.ts`                                                                                                    |
| `PORT`                                                                                      | `3000`                                                                  | `main.ts`                                                                                                                                            |
| `NODE_ENV`                                                                                  | (нет, ставит скрипт)                                                    | `app.module.ts` — переключает `ServeStaticModule`                                                                                                    |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_API_KEY`                                          | `admin@kaufman.bot` / `change-me` / `change-me`                         | `SeedService` — upsert админа при старте                                                                                                             |
| `USER1_EMAIL` / `USER1_PASSWORD` / `USER1_API_KEY`                                          | `user1@kaufman.bot` / `change-me` / `change-me`                         | `SeedService.seedDefaultUser` — первый demo-USER                                                                                                     |
| `USER2_EMAIL` / `USER2_PASSWORD` / `USER2_API_KEY`                                          | `user2@kaufman.bot` / `change-me` / `change-me`                         | `SeedService.seedDefaultUser` — второй demo-USER                                                                                                     |
| `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_USE_SSL` | `localhost` / `29000` / `minioadmin` / `minioadmin123` / `false`        | `minio-storage` MCP (приложение пока не использует напрямую)                                                                                         |
| `E2E_BASE_URL`                                                                              | (не задан)                                                              | e2e-тесты — переключает baseUrl; дефолт `http://localhost:3000`                                                                                      |
| `TELEGRAM_WEBHOOK_BASE_URL`                                                                 | (не задан)                                                              | `TelegramWebhookService` — публичный HTTPS-origin для `setWebhook` (`${base}/api/telegram/webhook/<botId>`); пусто → регистрация пропускается с warn |
| `GITHUB_PERSONAL_ACCESS_TOKEN`                                                              | (не задан)                                                              | MCP `github` (Docker-образ `ghcr.io/github/github-mcp-server`)                                                                                       |

**Примечания:**

- Seed читаются при `OnApplicationBootstrap` (`backend/src/seed/seed.service.ts`);
  `ADMIN_EMAIL` и `ADMIN_API_KEY` — ключи upsert; пароль хэшируется `scrypt`
  перед записью. `USER{1,2}_*` подчиняются тому же паттерну; при неполном
  наборе — warn и пропуск пользователя (не падение).
- Значения по умолчанию в `.env.example` — **заглушки**, при первом запуске
  меняются на месте (прод-секреты не коммитятся).
- `PrismaService` читает `DATABASE_URL` **в конструкторе** и Nest-ConfigModule
  не подключён — поэтому prod-скрипт обязан передать env через `node
--env-file`, а не через рантайм-import (см.
  [decisions.md](decisions.md#node---env-file)).

## 4. Запуск

### Dev

```bash
npm run install:all              # root + backend + frontend
cp backend/.env.example backend/.env
npm run start:dev                # = ./start-dev.sh
# backend :3000, frontend :4200 (ng serve + proxy /api), tunnel tuna
```

Шаги `start-dev.sh`:

1. `cp backend/.env.example backend/.env` (если отсутствует).
2. `docker compose up -d` (PostgreSQL + MinIO).
3. Ожидание healthcheck у `kaufman-bot-db` и `kaufman-bot-minio`.
4. `npx prisma migrate deploy` из `./backend`.
5. `npx -y pm2 start ./ecosystem.config.cjs` — три PM2-процесса: backend,
   frontend, tunnel.

Остановка: `npm run stop:dev` (→ `./stop-dev.sh` → `pm2 delete ecosystem.config.cjs`).

**Важно.** В dev `ServeStaticModule` **не подключается** (`NODE_ENV=development`),
поэтому `curl http://localhost:3000/` → 404 — это ожидаемо; фронт доступен на `:4200`.

### Prod

```bash
npm run start:prod              # = ./start-prod.sh
# :3000 раздаёт Angular + API + Swagger
```

Шаги `start-prod.sh`:

1. `cp backend/.env.example backend/.env` (если отсутствует).
2. `cd frontend && npm run build` — Angular CLI пишет в
   `backend/client/browser/` (outputPath `../backend/client`).
3. `cd backend && npm run build` — `nest build` → `backend/dist/`.
4. `docker compose up -d` + ожидание PostgreSQL.
5. `npx prisma migrate deploy`.
6. `npx -y pm2 start ./ecosystem-prod.config.cjs`.

`ecosystem-prod.config.cjs`:

```js
{
  name: 'kaufman-bot-backend-prod',
  cwd: 'backend',
  script: 'dist/main.js',
  // dist/main.js читает DATABASE_URL из процесса, а ConfigModule не
  // подключён — env отдаём через node-флаг (абсолютный путь, чтобы chdir
  // внутри cluster-worker не сломал резолв).
  node_args: `--env-file=${__dirname}/backend/.env`,
  watch: false,
  instances: 1,
  exec_mode: 'cluster',
  max_memory_restart: '1G',
  env: { NODE_ENV: 'production' },
}
```

**Почему `script: 'dist/main.js'`, а не `script: 'npm' + args: 'run start:prod'`** —
в `exec_mode: 'cluster'` PM2 перехватывает stdout/stderr только у процесса,
который он сам форкнул; обёртка через npm теряла application-логи. Старая
схема заменена; **не** возвращаться к ней.

Остановка: `npm run stop:prod`.

## 5. Prisma CLI

`backend/prisma.config.ts` поднимает `dotenv/config` и читает `DATABASE_URL`
из `backend/.env`. Поэтому Prisma работает **только** при наличии `.env` и
**только** из корня `backend/`.

| Команда                                | Где                   | Что делает                                              |
| -------------------------------------- | --------------------- | ------------------------------------------------------- |
| `npm run generate` (root)              | корень                | алиас на `prisma generate` в backend                    |
| `npx prisma generate`                  | `backend/`            | перегенерировать Prisma Client в `src/generated/prisma` |
| `npm run prisma:migrate` (root)        | корень                | dev-миграции (`prisma migrate dev`)                     |
| `npx prisma migrate dev --name <slug>` | `backend/`            | новая миграция                                          |
| `npx prisma migrate deploy`            | `backend/`            | прод-применение (в `start-{dev,prod}.sh`)               |
| `npx prisma studio`                    | **только** `backend/` | визуальный браузер (корневой скрипт удалён)             |
| `npx prisma migrate status`            | **только** `backend/` | статус миграций (корневой скрипт удалён)                |

Правило: schema.prisma **не** правится руками в обход миграций (см.
[`prisma-migrations-only`](../.agents/skills/prisma-migrations-only/SKILL.md)).

## 6. Docker-образы

[`docker-compose.yml`](../docker-compose.yml):

- **`pgvector/pgvector:pg18`** — PostgreSQL 18 + pgvector; именованный том
  `kaufman_bot_postgres_volume` монтируется в `/var/lib/postgresql` (путь
  выбран для совместимости PG 18+, где PGDATA = `.../pgdata`).
- **`docker.io/bitnamilegacy/minio:2025.7.23-debian-12-r0`** — MinIO.
  Официальные образы `minio/minio` сняты с публичной раздачи (pull access
  denied), поэтому взят последний свежий публично тянущийся build из
  legacy-каталога Bitnami. Контейнер работает под `user: root`, иначе /data
  от предыдущего образа принадлежит root и MinIO падает на
  `file access denied`. Команда — `server /data --console-address ":9001"`;
  entrypoint Bitnami понимает её так же, как оригинальный образ.

## 7. MCP-конфигурация

### Project vs. user level

Qoder (и совместимые IDE) читают **два** уровня:

| Уровень | Файл                        | Приоритет |
| ------- | --------------------------- | --------- |
| project | [`.mcp.json`](../.mcp.json) | выше      |
| user    | `~/.qoder/mcp.json`         | ниже      |

**Проектный `.mcp.json` перекрывает одноимённые серверы пользователя** —
поэтому в проекте `postgres` смотрит в `kaufman_bot` на `localhost:5432`,
даже если в пользовательском конфиге он указывает на чужую БД. Для
совместимости с VS Code тот же набор продублирован в блоке `mcp`
[`.vscode/settings.json`](../.vscode/settings.json).

### Серверы проекта

| Сервер                 | Тип                         | Подключение                                                                 |
| ---------------------- | --------------------------- | --------------------------------------------------------------------------- |
| `postgres`             | stdio                       | `postgresql://kaufman:kaufman@localhost:5432/kaufman_bot`                   |
| `minio-storage`        | stdio                       | `localhost:29000`, `minioadmin`/`minioadmin123`                             |
| `github`               | Docker (`stdio`-подкоманда) | `ghcr.io/github/github-mcp-server --toolsets=default,actions,notifications` |
| `context7`             | HTTP                        | облачный, интернет                                                          |
| `sequential-thinking`  | stdio                       | локально                                                                    |
| `playwright`           | stdio                       | локально                                                                    |
| `browser-use`, `genui` | (встроенные IDE)            | в проектном конфиге **нет**                                                 |

**Важно:** наличие сервера в `.mcp.json` не означает, что он реально запущен
в текущей сессии. Реальное множество подключённых MCP видно в
`~/.config/Qoder/<hash>/SharedClientCache/projects/<project>/mcps/`. При
первом открытии проекта Qoder запрашивает подтверждение; при проблемах —
`/mcp reload`. GitHub-операции в CLI доступны всегда: `gh run list`,
`gh run view --log-failed` дают те же данные, что и MCP.

### Github MCP: почему Docker, а не npm

См. [`decisions.md#github-mcp-docker`](decisions.md#github-mcp-docker).

### Postgres MCP — **только чтение**

MCP `postgres` подключён к рабочей БД и удобен для инспекции (счётчики,
сверка сида, проверка cascade). **Нельзя** писать — все изменения идут
только через приложение (сервисы, HTTP API) либо через Prisma-миграции.
Схему читают из `backend/prisma/schema.prisma`.

## 8. Профили PM2

- `ecosystem.config.cjs` (dev): 3 приложения, все `script: 'npm' +
args: 'run …'`.
- `ecosystem-prod.config.cjs` (prod): 1 приложение, `script:
'dist/main.js'`, `exec_mode: 'cluster'`, `node_args: --env-file …`.

Логи: `pm2 logs kaufman-bot-backend --nostream` (dev) или
`kaufman-bot-backend-prod` (prod) — **самый быстрый** источник истины о
рантайме, особенно при cluster-воркерах.

## 9. `opwork` как git-сабмодуль

Каталог [`opwork/`](../opwork) — справочный проект Ильшата (`site15/opwork`),
используется как референс при сравнении решений.

- [.gitmodules`](../.gitmodules): `[submodule "opwork"] path = opwork url =
https://github.com/site15/opwork.git`.
- Корневой [`.gitignore`](../.gitignore) содержит `opwork/` — рабочая копия
  не попадает в `git status`.
- Инициализация по запросу: `git submodule update --init opwork`. CI его
  **не** разворачивает.
- **Ловушка.** Если `opwork/` записан как gitlink (mode `160000`) **без**
  секции в `.gitmodules`, то `git submodule status` и `git submodule
foreach --recursive` возвращают **exit 128** (`fatal: No url found for
submodule path 'opwork' in .gitmodules`). Это ломало второй `actions/checkout`
  в [`e2e-prod.yml`](../.github/workflows/e2e-prod.yml) — починено оформлением
  сабмодуля; подробности в [`pitfalls.md#github-actions-gitlink`](pitfalls.md#github-actions-gitlink).

## 10. npm-скрипты (корень)

Корневой [`package.json`](../package.json) — координатор monorepo:

| Скрипт           | Что делает                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `install:all`    | `npm install` в корне + backend + frontend                                                                         |
| `start:dev`      | вызывает `./start-dev.sh`                                                                                          |
| `stop:dev`       | вызывает `./stop-dev.sh`                                                                                           |
| `start:prod`     | `NODE_ENV=production node --env-file .env dist/main.js` (из backend) **или** `./start-prod.sh` — уточнить по факту |
| `stop:prod`      | вызывает `./stop-prod.sh`                                                                                          |
| `prisma:migrate` | `npx prisma migrate dev` из backend                                                                                |
| `format`         | Prettier по всему дереву (исключая generated)                                                                      |

Старые дубли `infra:*`, `dev:stop`, `format:*`-проброски удалены; **не**
возвращать. Backend и frontend держат собственные скрипты (см. их README).

## 11. Прокси фронта

[`frontend/proxy.conf.json`](../frontend/proxy.conf.json) перенаправляет
`/api` → `http://localhost:3000`. Подключается через
[`frontend/angular.json`](../frontend/angular.json): `serve.options.proxyConfig`.

В prod `proxy.conf.json` **не** участвует — SPA и API живут на одном origin,
CORS выключается, а относительный `/api/v1` резолвится в тот же порт `:3000`.

## 12. CI / GitHub Actions

Два workflow (см. [`../.github/workflows/`](../.github/workflows)):

- **`ci.yml`** — push в `main` + PR: линты, сборки, unit-тесты backend и
  frontend, публикация JUnit.
- **`e2e-prod.yml`** — ручной dispatch: `start:prod` + backend-e2e +
  frontend-e2e + `stop:prod` с публикацией отчётов и артефактов.

Workflow **не** разворачивает `opwork`-сабмодуль; в прод-e2e второй checkout
заменён на `git fetch + git archive` (см. pitfalls).

## 13. Итоговый чек-лист первой машины

```bash
node --version                # v24.x
docker --version              # 24+
git --version                 # 2.40+

git clone git@github.com:kaufman-bot/kaufman-bot.git
cd kaufman-bot
npm run install:all
cp backend/.env.example backend/.env   # и поменять дефолтные ключи
cd backend && npx prisma generate && cd ..

npm run start:dev                       # поднимает docker + миграции + PM2
curl -sI http://localhost:3000/api/v1/health
curl -sI http://localhost:4200          # ng serve (dev)

# e2e требуют запущенного прод-стека
npm run stop:dev
npm run start:prod
curl -sI http://localhost:3000          # теперь 200 (ServeStatic)
```

## Источники

| Файл                                                                      | Что фиксирует                                                    |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [`docker-compose.yml`](../docker-compose.yml)                             | Порты 5432/29000/29001, креды, healthcheck, MinIO Bitnami legacy |
| [`ecosystem.config.cjs`](../ecosystem.config.cjs)                         | Dev-процессы PM2                                                 |
| [`ecosystem-prod.config.cjs`](../ecosystem-prod.config.cjs)               | Prod PM2: `script: 'dist/main.js'`, `node_args: --env-file`      |
| [`start-dev.sh`](../start-dev.sh), [`start-prod.sh`](../start-prod.sh)    | Последовательность запуска                                       |
| [`backend/.env.example`](../backend/.env.example)                         | Полный inventory env-переменных                                  |
| [`backend/prisma.config.ts`](../backend/prisma.config.ts)                 | Обязательность `.env` для Prisma CLI                             |
| [`.mcp.json`](../.mcp.json)                                               | Проектные MCP-серверы                                            |
| [`.vscode/settings.json`](../.vscode/settings.json)                       | Дубль MCP для VS Code + рекомендации                             |
| [`.gitmodules`](../.gitmodules)                                           | `opwork` submodule URL                                           |
| [`frontend/proxy.conf.json`](../frontend/proxy.conf.json)                 | Прокси dev `/api` → `:3000`                                      |
| [`frontend/angular.json`](../frontend/angular.json)                       | `outputPath: '../backend/client'`, `proxyConfig`                 |
| [`backend/src/main.ts`](../backend/src/main.ts)                           | `PORT=3000` (по умолчанию), prefix, versioning                   |
| [`backend/src/app.module.ts`](../backend/src/app.module.ts)               | Условие `isProd` для `ServeStaticModule`                         |
| [`backend/src/seed/seed.service.ts`](../backend/src/seed/seed.service.ts) | Как читаются `ADMIN_*` / `USER{1,2}_*`                           |
