# Решения (ADR-lite)

Короткие заметки «контекст → решение → последствия». Каждый пункт
фиксирует **развилку**, которую проект прошёл осознанно, и её границы
применимости. Новые варианты **не** появляются на пустом месте: если
правило жёсткое — оно уже в `.agents/skills/*`, если техническое
ограничение — в [pitfalls.md](pitfalls.md).

---

<a id="node---env-file"></a>

## 1. `.env` грузится через `node --env-file`, а не dotenv/ConfigModule

**Context.** `PrismaService` и `ecosystem-prod.config.cjs` читают
`process.env.DATABASE_URL` в конструкторе; глобальный `ConfigModule` не
подключён. Нужен способ дать Node-процессу переменные из `backend/.env` до
того, как сработают первые `process.env.*`.

**Decision.** Использовать нативный флаг Node 20.7+:

```bash
# backend/package.json
"start:prod": "NODE_ENV=production node --env-file .env dist/main.js"
# ecosystem-prod.config.cjs
node_args: `--env-file=${__dirname}/backend/.env`
```

Абсолютный путь в PM2 нужен, потому что `exec_mode: 'cluster'` может
chdir-нуть воркера после парсинга `--env-file`.

**Rejected alternatives.**

- `import 'dotenv/config'` в `main.ts` — добавляет рантайм-зависимость и
  прячет загрузку env в код приложения.
- `ConfigModule.forRoot({ isGlobal: true })` — централизованно, но
  провайдеры читают `process.env` в конструкторах **до** инициализации
  ConfigService; потребовалась бы миграция `PrismaService` на инъекцию
  `ConfigService`.

**Consequences.**

- `NODE_ENV` и `--env-file` живут в скриптах и PM2-конфиге; `.env`
  резолвится от CWD, совпадающего с `backend/`.
- Переменные, выставленные в shell/PM2, **не** перекрываются флагом —
  ожидаемое поведение.
- `start-prod.sh` гарантирует существование файла, поэтому жёсткое
  поведение флага на отсутствующем `.env` безопасно.

**Applies while.** Сервисы читают `process.env` напрямую; Node ≥ 20.7
(проект на 24). Пересмотр — при переходе на `ConfigModule` + инъекцию
`ConfigService` в `PrismaService`.

---

<a id="github-mcp-docker"></a>

## 2. GitHub MCP — официальный Docker-образ, не npm-пакет

**Context.** Нужен MCP-сервер для GitHub API (actions, issues, PR,
notifications) с проектным `.mcp.json`.

**Decision.** Использовать `ghcr.io/github/github-mcp-server` через
`docker run` c подкомандой `stdio` и
`--toolsets=default,actions,notifications` (≈ 56 инструментов в v2.0.2).
Токен — из `GITHUB_PERSONAL_ACCESS_TOKEN`, иначе из `gh auth token`.

**Rejected alternatives.**

- `@modelcontextprotocol/server-github` (npm) — **deprecated**, официально
  не поддерживается, `npx` тянет устаревшую версию без новых toolset'ов.
- `browser-use-mcp` — это **другой** продукт (облачный веб-поиск через
  `BROWSER_USE_API_KEY`), не заменяет `playwright`, не относится к GitHub.

**Consequences.**

- Требуется Docker-деемон на машине разработчика (уже нужен для PostgreSQL
  - MinIO).
- Токен **не** хранится в репозитории; он либо в env, либо в gh-credstore.
- При первом запуске Qoder спросит подтверждение проектного MCP; при
  проблемах — `/mcp reload` (см.
  [pitfalls.md#mcp-not-loaded](pitfalls.md#mcp-not-loaded)).

**Applies while.** Официальный Docker-образ публикуется и поддерживает
`stdio` + toolsets. Переход на облачный endpoint потребует пересмотра
авторизации и запуска.

---

<a id="e2e-http-only"></a>

## 3. Backend e2e ходит через HTTP + SDK, не поднимает Nest и не трогает Prisma

**Context.** E2E-тесты должны проверять **реальный HTTP-контракт**, а не
только внутреннюю логику. Тестовый фреймворк `vitest` уже настроен, Nest
умеет подниматься через `Test.createTestingModule`, но это другой сценарий
(интеграционный).

**Decision.** Тесты идут через **живой бэкенд** на
`E2E_BASE_URL ?? http://localhost:3000` и типизированный SDK (`@hey-api/openapi-ts`
из `backend/swagger.json` → `backend/test/generated/client`). Никаких
`Test.createTestingModule` / `createNestApplication` / `new PrismaClient()`.
Фикстуры создаются **только** вызовами контроллеров.

**Rejected alternatives.**

- Классические Nest e2e с `Test.createTestingModule` — поднимали бы своё
  приложение, не проверяли бы реальный `main.ts` (CORS, prefix, Swagger,
  ServeStatic, seed).
- Prisma-фикстуры напрямую — нарушают границу «только API-контракт» и
  создают состояние, которое боевое приложение никогда не создаёт.

**Consequences.**

- После изменения контракта обязательна цепочка: `start:dev` →
  `generate:openapi-ts` → `test:e2e`.
- SDK в VCS — на свежем клоне тесты работают без предварительной
  перегенерации.
- Если состояние нельзя создать эндпоинтом — эндпоинт **добавляется**, а
  не используется `prisma.*`.
- `ActivityHelper` stateful (см. [pitfalls](pitfalls.md#activity-helper-stateful)) —
  каждый ADMIN имеет свой инстанс; см.
  [`e2e-fixture-hygiene`](../.agents/skills/e2e-fixture-hygiene/SKILL.md).

**Applies while.** Тесты не должны заводить тестовые обёртки. Пересмотр —
если проект перейдёт на контейнерный e2e (docker-compose с ephemeral БД и
авто-bootstrap приложения).

---

<a id="one-app-module"></a>

## 4. Ровно один Nest-модуль (`AppModule`), без feature-modules

**Context.** NestJS официально поддерживает разбивку на `AuthModule`,
`ChatModule`, `UsersModule`. Проект маленький, DI в одном модуле проще.

**Decision.** **Только** `AppModule`. Всё остальное — plain providers,
plain controllers, плюс `imports[]` из внешних API (`ServeStatic`,
`Observe`, легаси `PrismaModule`/`SeedModule` как shim). Полный канон +
сам-проверка —
[`backend-module-topology`](../.agents/skills/backend-module-topology/SKILL.md).

**Rejected alternatives.**

- Feature-модули — добавляют import-граф, экспортируют сущности, ломают
  «одно изменение — один экран diff».
- `SharedModule`, `CoreModule` — проект не настолько велик.

**Consequences.**

- Регистрация нового сервиса = одна строка в `providers[]`.
- `PrismaModule`/`SeedModule` **slated for removal** — см.
  [`BACKLOG.md #3`](../BACKLOG.md).
- Плагинные токены агрегируются через `useFactory` (см.
  [pitfalls](pitfalls.md#nest-multi-provider)).

---

<a id="service-layer-split"></a>

## 5. Сервисы: entity-CRUD vs. use-case

**Context.** Первый вариант `AuthService` смешивал `register` и CRUD
пользователей; тесты становились монолитными.

**Decision.** Два вида сервисов, разделённых по **responsibility**, не по
domain name. Правила, reference layout и self-check —
[`service-layer-split`](../.agents/skills/service-layer-split/SKILL.md).
Ключевые границы:

- `UsersService` — CRUD над `User`.
- `AuthService.register/profile/updateProfile` — use-case (compose,
  hash password, first key, timezone validation).
- `ApiKeysService` — CRUD ключей; `ButtonPresetsService` — owner-scope
  CRUD; `MockBotService.replyAsBot` — use-case.
- `ChatService.sendMessage/submitButtonCallback/streamEvents` — use-case
  с transaktciонным outbox-инvariant.
- `BotPluginsService` — диспетчер + sweep (инфра-сервис).

**Rejected alternatives.**

- «Толстая» entity-CRUD служба, знающая про flows.
- Тонкий слой «use-case → сервис-оператор → сервис» — лишняя обёртка.

**Consequences.** Валидационные константы (`EMAIL_REGEX`,
`MIN_PASSWORD_LENGTH`) живут рядом со сценарием; shared — только при двух
реальных callers.

---

<a id="transactional-outbox"></a>

## 6. Bot-plugin доставка через транзакционный outbox

**Context.** Ответы плагинов могут теряться при рестартах Nest; нужен
exactly-once в кластере.

**Decision.** Модель `BotPluginTask` + `PENDING → PROCESSING → DONE`:

- `ChatService.sendMessage` пишет `Message(USER)` и `BotPluginTask`
  в **одной** `prisma.$transaction`.
- `BotPluginsService.dispatchAndReply` захватывает задачу условным
  `updateMany(PENDING → PROCESSING)`; `count === 0` → чужая.
- Reply + `updateMany(PROCESSING → DONE)` — в той же транзакции.
- Recovery: `OnApplicationBootstrap` + sweep каждые 30 с; `PROCESSING`
  старше 60 с → обратно в `PENDING`.

**Rejected alternatives.**

- Fire-and-forget `void dispatch()` — терялись ответы при рестарте.
- BullMQ/Redis очередь — избыточно до появления Redis (см.
  [`BACKLOG.md`](../BACKLOG.md)).
- Отдельная таблица задач с ретраями — нет нужды; ошибка плагина
  **закрывает** задачу без reply (изоляция).

**Consequences.**

- Exactly-once между рестартами без внешнего брокера.
- In-process `sweeping`-флаг **не** защищает cluster; поэтому `STALE_PROCESSING_MS
= 60_000` завышен и захват идёт условным `updateMany`.
- При переходе на Redis: флаг заменяется на Redlock, шина `ChatEventsService`
  — на event bus (см. `BACKLOG.md #1/#2`).

---

<a id="playwright-single-worker"></a>

## 7. Playwright-e2e идут в **один** worker

**Context.** Фронтовые e2e пишут в **ту же** живую БД, что и backend e2e;
параллельные прогоны конфликтовали по уникальным email/ключам и по
`unreadCount`.

**Decision.** В
[`frontend/playwright.config.ts`](../frontend/playwright.config.ts):
`fullyParallel: false`, `workers: 1`. Retries: `1` в CI, `0` локально.

**Rejected alternatives.**

- Параллельные воркеры с изолированными БД — потребовало бы контейнерной
  инфраструктуры и ephemeral-схем.
- Отдельные seed-данные на воркер — усложняет фикстуры и ломает
  `e2e-fixture-hygiene`.

**Consequences.** Прогон медленнее; в CI это осознанная трата времени ради
детерминизма. При переходе на ephemeral БД на воркер — решение пересматривается.

---

<a id="sdk-in-vcs"></a>

## 8. Сгенерированный OpenAPI SDK хранится в VCS

**Context.** После `swagger.json` → `@hey-api/openapi-ts` получаем
`backend/test/generated/client`. Если не коммитить — e2e на fresh clone
требуют двух предварительных шагов (старт бэкенда, генерация).

**Decision.** SDK **в VCS**; `.prettierignore` его исключает, чтобы
форматтер не переписывал generated-код.

**Rejected alternatives.**

- Генерировать в `pretest` — добавляет скрытый шаг, усложняет CI и
  локальный онбординг.
- Не коммитить, но запускать `start:dev` автоматически — делает тесты
  зависимыми от boot-процедуры.

**Consequences.**

- После изменения контракта **нужно** закоммитить пересгенерированный SDK,
  иначе PR не пройдёт CI.
- Diff SDK при ревью большой, но виден — это полезный сигнал «изменился API».

---

<a id="api-version-uri"></a>

## 9. URI-версионирование `/api/v1`, Swagger без `/api`

**Context.** Проект публичный, контракт должен эволюционировать без
поломки клиентов. Варианты: header-версионирование, media-type, URI.

**Decision.** `app.setGlobalPrefix('api') +
app.enableVersioning({ type: VersioningType.URI, prefix: 'v',
defaultVersion: '1' })`. Контроллеры без `version` автоматически попадают в
`/api/v1`. Breaking change — новая версия в конкретном `@Controller({
version: '2' })`. `SwaggerModule.setup('swagger', ...)` регистрируется **до**
prefix, то есть путь `/swagger` вне версии.

**Rejected alternatives.**

- Header/media-type версионирование — сложнее для `EventSource` и браузерных
  e2e.
- `VERSION_NEUTRAL` повсеместно — ломает future-миграцию на v2.

**Consequences.**

- Все URL проекта предсказуемы: `/api/v1/...`, `/swagger/...`, `/swagger.json`
  (файл пишется boot'ом).
- В `@nestjs/core` 12 в `VersioningOptions` нет `exclude` — неверсируемые
  маршруты через `VERSION_NEUTRAL`.

---

<a id="seed-defaults"></a>

## 10. Seed-дефолты: один ADMIN + два USER

**Context.** Нужен стабильный стартовый набор для e2e, Playwright и
ручного демо.

**Decision.** `SeedService.onApplicationBootstrap` идемпотентно upsert'ит:

- **ADMIN**: `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_API_KEY`.
- **USER #1**: `USER1_EMAIL`/`USER1_PASSWORD`/`USER1_API_KEY`.
- **USER #2**: `USER2_EMAIL`/`USER2_PASSWORD`/`USER2_API_KEY`.

Ключи upsert — `email` и `ApiKey.key`; пароль хэшируется `scrypt` перед
записью. При неполном наборе USER-переменных — warn и пропуск (не падение).

**Rejected alternatives.**

- Сид через SQL-скрипты — не работает с Prisma migrations.
- Сид только в seed-файле `prisma db seed` — отдельно от приложения, легко
  рассинхронизируется.

**Consequences.**

- Значения по умолчанию в `.env.example` — **заглушки**, обязанные быть
  заменёнными перед продом.
- Bоевые ключи сид-админа **нельзя** трогать в e2e — см.
  [`e2e-fixture-hygiene`](../.agents/skills/e2e-fixture-hygiene/SKILL.md).

---

<a id="minio-bitnami-legacy"></a>

## 11. MinIO берём из `bitnamilegacy`, не с `docker.io/minio/*`

**Context.** Нужен S3-совместимый object storage в docker-compose.

**Decision.** `image:
docker.io/bitnamilegacy/minio:2025.7.23-debian-12-r0`, `user: root`,
`command: server /data --console-address ":9001"`.

**Rejected alternatives.**

- `minio/minio` — официально снят с публичной раздачи; анонимный pull даёт
  `pull access denied`.
- `quay.io/minio/*` — тоже.

**Consequences.**

- `user: root` обязателен: `/data` в томе записан предыдущим образом как
  root-owned, без `user: root` MinIO падает на `file access denied`.
- Bitnami entrypoint понимает `server /data ...` как оригинальный — команда
  не меняется.
- Обновления — вручную, по релизам `bitnamilegacy`.

---

<a id="opwork-submodule"></a>

## 12. Справочный проект `opwork` оформлен git-сабмодулем

**Context.** Нужен референс `site15/opwork` внутри дерева нового проекта,
но **не** хотим тащить его history в этот репозиторий.

**Decision.** `.gitmodules` с секцией `[submodule "opwork"] path = opwork
url = https://github.com/site15/opwork.git`; `opwork/` в `.gitignore`; CI
его **не** разворачивает; `git submodule update --init opwork` — по запросу.

**Rejected alternatives.**

- `gitlink` без `.gitmodules` (как было раньше) — ломает `git submodule
foreach` с exit 128, что роняло второй `actions/checkout` (см.
  [pitfalls.md#github-actions-gitlink](pitfalls.md#github-actions-gitlink)).
- Копия `opwork/` в дереве — удвоение history и merge conflict.

**Consequences.**

- Второй checkout в e2e-prod.yml заменён на `git fetch + git archive`
  (см. pitfalls).
- Локальная рабочая копия `opwork/` не попадает в `git status`.

---

<a id="memory-in-repo"></a>

## 13. Вся проектная память хранится в репозитории

**Context.** В проекте могут работать разные разработчики и разные
AI-агенты (Qoder, Cursor, Claude Code). Личная память агента
машинно-локальна и не переносится между машинами.

**Decision.** Вся проектная память (правила, architecture, env, pitfalls,
решения, specs, backlog) живёт в репозитории. Формат и карта —
[`../.agents/skills/agent-memory-policy/SKILL.md`](../.agents/skills/agent-memory-policy/SKILL.md)
и [`README.md`](README.md).

**Rejected alternatives.**

- Оставить часть фактов в agent memory — ломает воспроизводимость: новый
  разработчик или другой агент не видит правило.
- Wiki / Confluence — не проходит review, расходится с кодом.

**Consequences.**

- **Workflow агента**: «хочу сохранить память → сначала пишу в файл → если
  файл уже есть, memory **не** создаю».
- Жёсткие правила — `SKILL.md`; OpenSpec-видимые ограничения —
  `openspec/config.yaml context:`; поведение системы — `openspec/specs`;
  развилки — [`decisions.md`](decisions.md); инфраструктура —
  [`environment.md`](environment.md); архитектура —
  [`architecture.md`](architecture.md); баги —
  [`pitfalls.md`](pitfalls.md); долг — [`../BACKLOG.md`](../BACKLOG.md).
- **Запрещено** хранить секреты в проектных файлах — только `.env`
  (gitignored).
- **Запрещено** хранить transient state (PID, ветка, debug-вывод) — это
  вообще не «память».

**Applies while.** Пока проект открыт для нескольких контрибьюторов и
AI-workflow. Пересмотр — если часть знаний станет приватной (customer PII),
тогда она уходит в закрытые knowledge-bases, но **не** в память агента.

---

<a id="scrypt-not-bcrypt"></a>

## 14. Хэширование паролей — `node:crypto` `scrypt`, не bcrypt

**Context.** На этапе добавления `User.password` в схему bcrypt отсутствовал в
зависимостях backend; нужно было выбрать KDF с минимальным footprint.

**Decision.** [`backend/src/utils/hashPassword.ts`](../backend/src/utils/hashPassword.ts)
использует `scryptSync`/`scrypt` из `node:crypto` + `timingSafeEqual`. Формат
хранения — `salt:hash` (hex), salt 16 байт, keylen 64. Никаких нативных
зависимостей, никаких peer-конфликтов в ESM/Docker.

**Rejected alternatives.**

- `bcrypt` / `bcryptjs` — нативная компиляция ломает сборку в ESM (`type:
'module'`) и Docker-образе; `bcryptjs` — чистый JS, но медленнее и всё равно
  доп. пакет.
- `argon2` — тоже нативный, тот же class проблемы.
- `passport` / `@nestjs/passport` — лишняя абстракция, пока достаточно одного
  local-стратегии через `AuthService`.

**Consequences.**

- Портирование legacy bcrypt-хэшей **не** поддерживается — при необходимости
  придётся добавить отдельный verifier-мост (см. BACKLOG, если появится).
- Known-ограничение: невалидный hex в stored-hash кидает `RangeError` — см.
  [`pitfalls.md#verify-password-rangeerror`](pitfalls.md#verify-password-rangeerror).

**Applies while.** Пока проект держит минимум runtime-зависимостей и нет
необходимости совместимости с legacy bcrypt-хэшами. Пересмотр — при миграции
на готовую auth-библиотеку (Keycloak, Auth0) или при появлении legacy-паролей.

---

<a id="onboarding-series-sandbox-fallback"></a>

## 15. Сборка onboarding-серии: `git show <hash>:<path>` как fallback в песочнице

**Context.** `.agents/skills/git-onboarding-commit/SKILL.md` рекомендует
материализовывать файлы каждого шага через `git checkout SOURCE -- <path>`. В
песочнице Qoder с ограниченной записью `git checkout <hash> -- <path>` и
длинные `&&`-цепочки с `reset --hard` иногда падают с `bwrap: setting up uid
map: Permission denied` (SANDBOXING-ошибка).

**Decision.** Когда `git checkout <hash>` заблокирован песочницей, содержимое
файла материализуются перенаправлением вывода: `mkdir -p $(dirname <path>) &&
git show <hash>:<path> > <path>`. Parity-гейт `git diff --exit-code SOURCE
HEAD` после серии обязателен и не меняется. Команды указателя истории
(`reset --hard`, `switch`) выполняются **отдельными** вызовами, а не
склейкой.

**Rejected alternatives.**

- Интерактивный rebase (`rebase -i`) для вставки файла — запрещён скиллом и
  неудобен в автоматизированной сессии.
- Пересборка серии с нуля — корректно, но дороже по времени; выбран
  компромисс «материализация через show + отдельный завершающий коммит».

**Consequences.**

- Скилл `git-onboarding-commit` остаётся authoritative; этот ADR — лишь
  fallback-паттерн для окружений с sandbox-ограничением.
- Если окружение разрешает `git checkout <hash> -- <path>` и `rebase --onto`,
  предпочтительна «правильная» раскладка файлов по коммитам, а не show-fallback.

**Applies while.** Работает песочница с write-ограничением и без интерактивных
git-команд. Истекает — при переходе на окружение, где `checkout --hash` и
неинтерактивный rebase доступны.

**См. также:** [`.agents/skills/git-onboarding-commit/SKILL.md`](../.agents/skills/git-onboarding-commit/SKILL.md).
