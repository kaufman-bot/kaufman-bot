# Подводные камни и баги

Формат записи:

- **Symptom** — что видит разработчик, когда наступает.
- **Root cause** — почему происходит.
- **Fix / pattern** — как чинить.
- **Boundary** — когда правило применимо / истекает.

Если факт относится к архитектурной развилке — ссылка на
[decisions.md](decisions.md); если это жёсткое правило — ссылка на skill.

---

<a id="nest-multi-provider"></a>

## Nest не собирает несколько `useClass`-провайдеров одного токена в массив

**Symptom.** В рантайме `@Inject(BOT_PLUGINS) plugins: BotPlugin[]` приходит
**одним** экземпляром, не массивом. `this.plugins.find(...)` падает с
`TypeError: this.plugins.find is not a function`. Юнит-тесты зелёные — баг
виден только в e2e против живого бэкенда, и в PM2-логах уходит в
проглатывающий `try/catch`+`Logger.error`.

**Root cause.** NestJS (в отличие от Angular) хранит **одну** привязку на
токен; повторная `{ provide: TOKEN, useClass: X }` перезаписывает
предыдущую. Массива не получается.

**Fix.** Один раз предоставить токен через `useFactory` + `inject`-список,
а каждый плагин — как обычный provider:

```ts
providers: [
  PingPongPlugin,
  TimePlugin,
  SettingsPlugin,
  {
    provide: BOT_PLUGINS,
    useFactory: (pingPong, time, settings) => [pingPong, time, settings],
    inject: [PingPongPlugin, TimePlugin, SettingsPlugin], // порядок == приоритет диспетчера
  },
];
```

Код — в
[`backend/src/app.module.ts`](../backend/src/app.module.ts).
Проверка: `npx tsc --noEmit` не ловит; только `npm run test:e2e` или
рантайм.

**Boundary.** Любой дизайн с N стратегиями / хендлерами / валидаторами под
одним токеном в Nest: всегда требовать e2e-проверку реального DI. При
переходе на auto-discovery (`@Injectable()` + `Modules.scan`) правило
пересматривается (см. [BACKLOG.md](../BACKLOG.md)).

---

<a id="supertest-types-esm"></a>

## `Cannot find module 'supertest/types'` в NestJS e2e при ESM/nodenext

**Symptom.** IDE / `tsc --noEmit -p tsconfig.json` ругается на
`test/*.e2e-spec.ts` — не резолвится `import { App } from 'supertest/types'`.
`nest build` проходит (исключает `test/`), но проверка типов в редакторе
падает.

**Root cause.** В проекте `"type": "module"` и `moduleResolution: "nodenext"`.
`@types/supertest@7` (v7.2.1) **не** объявляет `exports` в `package.json`,
а тип `App` лежит в `types.d.ts` и не реэкспортируется из корневого
`index.d.ts`. Под `nodenext` импорт сабпата требует объявления в `exports`
— его нет.

**Fix.** Убрать хрупкий сабпатовый импорт и дженерик `App` у
`INestApplication<App>` в тестах. Типизация `getHttpServer()` чуть теряется,
но тест рабочий. Относительный импорт из `node_modules/@types/supertest/types.d.ts`
ломается при пересборке — его не делать.

**Boundary.** Пока `@types/supertest@7` не добавит `exports`, и в проекте
останется `type: module` + `nodenext`. **Не** пытаться чинить подменой
`moduleResolution` — это сломает остальной ESM-стек.

**Диагностика.** `tsc --noEmit -p tsconfig.json` (не `tsconfig.build.json`) —
только там видны ошибки тестов, скрытые из prod-билда.

---

<a id="activity-helper-stateful"></a>

## `ActivityHelper` stateful — один инстанс = один API-ключ

**Symptom.** Тест, который «переключает» пользователей через
`helper.loginAsAdmin(); helper.loginByApiKey(otherKey);`, ведёт себя
непредсказуемо: запросы, которые ожидались от `otherKey`, уходят от
предыдущего.

**Root cause.** `ActivityHelper` реализован поверх `client.setConfig({
headers: { 'x-api-key': … } })` — это мутация **общего** конфига
@hey-api-клиента, а не request-level override. После `setConfig` заголовок
живёт до следующего `setConfig`.

**Fix.** Каждый ADMIN / USER — **свой** инстанс `ActivityHelper`:

```ts
const admin = new ActivityHelper(); // сид-ключ, только admin/users ops
const adminA = new ActivityHelper(); // свой spawn-нутый ADMIN
const adminB = new ActivityHelper(); // второй spawn-нутый ADMIN
await adminA.loginByApiKey(adminAKeyFromRegister);
await adminB.loginByApiKey(adminBKeyFromRegister);
```

Паттерн `spawnAdmin(tag)` — в
[`../.agents/skills/e2e-fixture-hygiene/SKILL.md`](../.agents/skills/e2e-fixture-hygiene/SKILL.md).

**Boundary.** Пока ActivityHelper не переведён на request-scoped
`headers`-параметры SDK. Любые тесты, где два actor'а дёргают один SDK
последовательно, **обязаны** плодить отдельные инстансы.

---

<a id="seed-admin-mutation"></a>

## `afterAll` чистит кнопки / ключи боевого сид-админа

**Symptom.** В один прекрасный момент у `admin@kaufman.bot` пропадают
реальные продуктовые `ButtonPreset`-ы.

**Root cause.** `afterAll` в e2e-спеках делает `admin.loginAsAdmin()` +
цикл `for (const owner of [admin, admin2]) { … Remove all }` — удаляются
пресеты **сид-админа**, то есть боевые.

**Fix.** Все CRUD-проверки ведутся через **test-spawned** ADMIN'ов
(`adminA`/`adminB`), сид-админ остаётся только для `admin/users`
`register`/`PATCH`/`DELETE` по test-созданным id. Cleanup-цикл проходит по
`[adminA, adminB]`, сид-админ **не** enumerates. FK `onDelete: Cascade` даёт
belt-and-braces при `removeAccountAsAdmin`.

**Boundary.** Полное правило —
[`e2e-fixture-hygiene`](../.agents/skills/e2e-fixture-hygiene/SKILL.md).
Самопроверка:

```bash
grep -RnE 'admin\.sdk\.[a-zA-Z]+(Remove|Delete|Update|Create)V1' \
  backend/test/*.e2e-spec.ts
```

---

<a id="github-actions-gitlink"></a>

## GitHub Actions: второй `actions/checkout` падает на gitlink без `.gitmodules`

**Symptom.** Шаг с `actions/checkout@v4` на **другой** ref в отдельный
каталог падает с:

```
fatal: No url found for submodule path 'opwork' in .gitmodules
Error: Process completed with exit code 128.
```

При этом `actions/checkout` основного ref проходит.

**Root cause.** Каталог `opwork/` записан в индексе как **gitlink** (mode
`160000 commit`), но секции `[submodule "opwork"]` в `.gitmodules` нет.
`actions/checkout` вызывает `git submodule foreach --recursive`, который в
такой конфигурации возвращает 128. В post-фазе это warning, в основной —
fail.

**Fix (два шага).**

1. **Оформить сабмодуль** — добавить в
   [`.gitmodules`](../.gitmodules):

   ```ini
   [submodule "opwork"]
     path = opwork
     url = https://github.com/site15/opwork.git
   ```

   и держать `opwork/` в [`.gitignore`](../.gitignore), чтобы рабочая копия
   не мозолила `git status`. CI сабмодуль **не** инициализирует.

2. **Заменить второй checkout** — в
   [`.github/workflows/e2e-prod.yml`](../.github/workflows/e2e-prod.yml)
   используется один `actions/checkout` основного ref + overlay из второй
   ветки через CLI:
   ```bash
   git fetch --no-tags --depth=1 origin \
     "+refs/heads/<fe-branch>:refs/remotes/origin/<fe-branch>"
   # fallback на refs/tags, если ветка — тег
   git ls-tree --name-only <ref> -- <dir>
   git archive <ref> <dir> | tar -x
   ```
   Работает в shallow-клоне; даёт два независимых ref без вложенного `.git`.

**Boundary.** Пока в репозитории возможны gitlink-записи. Несуществующий ref
в archiving-скрипте должен давать **явную** ошибку шага, а не «успех с
пустым деревом».

---

<a id="github-actions-cleanup-exit1"></a>

## Cleanup-шаг CI красит job, когда старт не состоялся

**Symptom.** Реальный шаг упал на `start:prod`; cleanup (`pm2 delete all` /
`stop:prod`) возвращает `exit 1`, и job становится красным **из-за cleanup**,
скрывая первопричину.

**Root cause.** `pm2 delete` в состоянии «нет ни одного процесса» возвращает
1; `stop:prod` наследует это.

**Fix.** На cleanup-шагах — `continue-on-error: true`. Паттерн — в
[`.github/workflows/e2e-prod.yml`](../.github/workflows/e2e-prod.yml).

**Boundary.** Только cleanup. На тестовых/сборочных шагах `continue-on-error`
запрещён.

---

<a id="serve-static-exact-swagger"></a>

## ServeStatic wildcard не покрывает точные `/swagger` и `/swagger/`

**Symptom.** В prod `GET /swagger` отдаёт Angular `index.html`, а не Swagger
UI; `/swagger-json` и `/swagger/` ведут себя как исключённые, а корень —
нет.

**Root cause.** Паттерн `exclude: ['/swagger/{*path}']` в
[`@nestjs/serve-static`](https://github.com/nestjs/serve-static) матчит
«что-то после слэша» и **не** матчит сам `/swagger` (и `/swagger/` с
trailing-слэшем) — см. `isRouteExcluded` в исходниках.

**Fix.** Явно добавить отдельные записи: `'/swagger'`, `'/swagger/'` —
или держать Swagger UI **под префиксом** `/api` (тогда общий exclude
`/api/{*path}` их накрывает). В текущем проекте
[`backend/src/app.module.ts`](../backend/src/app.module.ts) оставлены два
паттерна `'/api/{*path}'` и `'/swagger/{*path}'`; при расширении перечня —
сверять с `isRouteExcluded`.

**Boundary.** Пока `SwaggerModule.setup('swagger', ...)` регистрируется без
`/api`-префикса.

---

<a id="hey-api-required-headers"></a>

## `@ApiHeader({ required: true })` + SDK = «header required» в каждом вызове

**Symptom.** В e2e-спеках на guard-эндпоинтах SDK требует передать заголовок
в `options.headers`, хотя `ActivityHelper` уже поставил `x-api-key`
глобально. Компиляция падает на ~45 местах.

**Root cause.** @hey-api/openapi-ts типизирует обязательный header как
поле в `options`, и даже при `securitySchemes` глобальный config клиента не
снимает требование.

**Fix.** На guard-эндпоинтах `@ApiHeader({ required: false })` — заголовок
всё равно проверится `ApiKeyGuard`-ом в рантайме. Это **конвенция** проекта;
объяснение — в
[`controller-dto-swagger`](../.agents/skills/controller-dto-swagger/SKILL.md).

**Boundary.** Пока `ActivityHelper.setConfig({ headers: { 'x-api-key': … }
})` остаётся основным способом аутентификации в e2e.

---

<a id="hey-api-query-type"></a>

## `@ApiQuery` без `type: String` даёт `query?: { x?: unknown }` в SDK

**Symptom.** SDK генерирует опциональный объект query с `unknown`, TS-лидер
не даёт читать поле как `string`.

**Root cause.** Без явной схемы `@ApiQuery({ name: 'x' })` даёт `schema: {}`,
SDK типизирует как `unknown`.

**Fix.** Всегда: `@ApiQuery({ name: 'x', type: String })` (или конкретный
`Schema` для объекта). Аналогично —
`@ApiUnauthorizedResponse({ type: ErrorDto })` вместо пустого, иначе error
типизирован `unknown`.

---

<a id="prisma-camelcase-quoting"></a>

## Prisma camelCase-колонки требуют кавычек в raw-SQL

**Symptom.** MCP `postgres query` падает: `column bp.owner_id does not
exist`, хотя Prisma схема показывает `ownerId`.

**Root cause.** Prisma `@@map("button_presets")` меняет **имя таблицы**, но
колонки рендерятся как `ownerId` (без `@map`). В PostgreSQL некавыченные
идентификаторы приводятся к lower-case, `ownerId` → `ownerid`.

**Fix.** Цитировать: `bp."ownerId"`. Пример:

```sql
SELECT u.email, count(bp.id)
FROM users u
LEFT JOIN button_presets bp ON bp."ownerId" = u.id
GROUP BY u.email;
```

**Boundary.** Только для колонок, не помеченных `@map` в snake_case. Либо
согласовывать схему через `@map("owner_id")` — тогда кавычки не нужны.

---

<a id="sdk-empty-options"></a>

## Методы @hey-api SDK требуют `options` — даже пустой `{}`

**Symptom.** `admin.sdk.listConversations()` не проходит `tsc` — SDK
генерирует сигнатуру с параметром `options`.

**Root cause.** Конфиг `operations: { strategy: 'single' }` делает options
**обязательным** параметром.

**Fix.** Явно передавать `{}`: `admin.sdk.listConversations({})`.

**Boundary.** Пока `strategy: 'single'`.

---

<a id="e2e-unique-email"></a>

## Коллизия email в e2e: `409 Conflict`

**Symptom.** При параллельном или повторном прогоне e2e `POST /auth/register`
возвращает 409 — `email` уже есть в БД.

**Root cause.** Тесты работают против **живой** БД (`docker-compose`, не
in-memory).

**Fix.** Уникальный email-суффикс на каждый `it()`:

```ts
const email = `t${Date.now()}@test.local`;
await admin.registerAccount(email);
```

**Boundary.** Пока e2e не идут против транзакции/отката (и так и останется —
проект сознательно использует HTTP-фикстуры вместо Prisma).

---

<a id="readcount-stale"></a>

## `unreadCount` обнуляется предыдущим чтением

**Symptom.** e2e проверяет `unreadCount === N`, получает `0`.

**Root cause.** `MockBotService.getConversationMessages` помечает сообщения
как прочитанные (`readAt`), и **предыдущий** вызов уже обнулил счётчик.

**Fix.** Пересоздать фикстуру (отправить новое сообщение) **перед**
assert'ом, либо читать unread через отдельный эндпоинт без побочного
эффекта.

---

<a id="inactive-key-owner-only"></a>

## Деактивация чужого ключа через `PATCH /api-keys/:id` недоступна админу

**Symptom.** Админ не может деактивировать чужой ключ, `PATCH` → 403.

**Root cause.** `/api-keys/*` scope-нут по владельцу. Для админ-операций
нужен `PATCH /api/v1/admin/users/:id` (`{ isActive: false }` на **юзере**),
не на ключе.

**Fix.** Тесты деактивированного ключа создают его через
`activity.issueKey({ isActive: false })` на **своём** аккаунте; админ
использует `PATCH /admin/users/:id`.

---

<a id="playwright-dev-vs-prod"></a>

## Playwright на `:3000` падает, если бэкенд в dev-режиме

**Symptom.** `npm run test:e2e` из frontend падает по таймауту: `GET /`
→ 404.

**Root cause.** `ServeStaticModule` подключается **только** при
`NODE_ENV === 'production'` (см. [architecture.md](architecture.md#prod-раздача-фронтенда-servestatic)).
В dev (`nest start --watch`) SPA не раздаётся.

**Fix.** Либо прод-стек (`npm run start:prod`), либо
`E2E_BASE_URL=http://localhost:4200 npm run test:e2e` (ng serve + proxy).

---

<a id="pm2-npm-wrapper"></a>

## `script: 'npm'` + `exec_mode: 'cluster'` теряет application-логи

**Symptom.** `pm2 logs kaufman-bot-backend` пустой, хотя Nest пишет
`Logger.log`.

**Root cause.** PM2 в cluster-режиме перехватывает stdout/stderr только у
процесса, который он сам форкнул. Обёртка `npm run start:prod` форкает
**дочерний** `node`, чьи логи PM2 не видит.

**Fix.** В
[`ecosystem-prod.config.cjs`](../ecosystem-prod.config.cjs) —
`script: 'dist/main.js'` + `node_args: --env-file=${__dirname}/backend/.env`
(абсолютный путь, потому что `cwd` уже `backend`, а cluster-worker может
chdir-нуться). **Не** возвращать npm-обёртку.

---

<a id="env-file-mandatory"></a>

## `backend/.env` обязателен даже для `prisma generate`

**Symptom.** `PrismaConfigEnvError: Cannot resolve environment variable:
DATABASE_URL` — на `npx prisma generate` / `migrate`.

**Root cause.** [`backend/prisma.config.ts`](../backend/prisma.config.ts)
использует `import 'dotenv/config'` и `env('DATABASE_URL')`.

**Fix.** `cp backend/.env.example backend/.env`; `start-dev.sh` /
`start-prod.sh` делают это автоматически.

**Boundary.** Пока `prisma.config.ts` не переведён на env-фолбеки без
DATABASE_URL.

---

<a id="mcp-not-loaded"></a>

## MCP-сервер в `.mcp.json` ≠ доступный в текущей сессии

**Symptom.** Вызов `CallMcpTool('github', ...)` падает: «tool not found»,
хотя `github` описан в [.mcp.json](../.mcp.json).

**Root cause.** Qoder физически подключает только разрешённые серверы; их
видно в каталоге `~/.config/Qoder/<hash>/SharedClientCache/projects/<project>/mcps/`.
Отсутствие подкаталога сервера = отсутствие в сессии. При первом открытии
проекта IDE просит подтвердить; после правок `.mcp.json` — `/mcp reload`.

**Fix / workaround.** Проверить каталог `mcps/`; при недоступности GitHub —
работать через `gh` CLI (`gh run list`, `gh run view --log-failed`,
`gh pr view`). Тот же источник данных, не зависит от MCP.

---

<a id="postgres-read-only"></a>

## MCP `postgres query` — только чтение

**Symptom.** Попытка `INSERT`/`UPDATE` через MCP выглядит успешно, но ломает
миграционный state и расходится с seed'ом.

**Root cause.** MCP `postgres` подключён к живой БД `kaufman_bot`. Любая
запись в обход Prisma-миграций и сервисов **не** попадает в `_prisma_migrations`
и **не** воспроизводится на другой машине.

**Fix.** Использовать только `SELECT`. Изменения идут через HTTP API
(эндпоинты), сервисы и Prisma-миграции.

---

<a id="dorny-reporter-junit"></a>

## `dorny/test-reporter` не принимает `reporter: junit`

**Symptom.** GitHub Actions: все шаги (lint/build/tests) зелёные, падает
только «Publish test results» с ошибкой
`Input variable 'reporter' is set to invalid value 'junit'`.

**Root cause.** В `dorny/test-reporter` (v1 и v3) валидный набор:
`dart-json`, `dotnet-trx`, `flutter-json`, `java-junit`, `jest-junit`,
`mocha-json`, `rspec-json`, `swift-xunit`. Значения `junit` **нет**; проверка
input выполняется **до** чтения файлов, поэтому XML валидность не спасает.

**Fix.** Для vitest junit XML и jest-junit одинаково подходит
`reporter: jest-junit` — парсер читает общую схему
`testsuites/testsuite/testcase` и группирует по `classname`. Плюс джобе
нужны `permissions: { contents: read, checks: write }` — экшен создаёт
check-runs.

**Boundary.** Правка
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) и
[`e2e-prod.yml`](../.github/workflows/e2e-prod.yml). Для экшенов других
авторов generic-junit может быть валидным — сверяться с `action.yml`
конкретного тега.

---

<a id="ng-lint-cascade"></a>

## Красный CI: «Publish test results» маскирует первый упавший шаг

**Symptom.** Frontend-job красный, «Publish test results» падает последним;
реальный виновник — **`ng lint`** (`@typescript-eslint/no-unused-vars`) или
unit-тесты, остановившие job до публикации JUnit.

**Root cause.** Порядок шагов в
[`ci.yml`](../.github/workflows/ci.yml): install → lint → build → test →
publish. Если lint/test падают, `junit.xml` не создаётся, publish падает
вторично. `npm test` и `ng build` локально линт **не** запускают, поэтому
дефект уходит в CI незамеченным.

**Fix.** Диагностика: смотреть `conclusions` **всех** steps
(`gh run view <id> --log` или MCP `github actions_get`) и брать **первый**
unsuccessful, а не последний. Типовой неиспользуемый binding —
`catch (e)` / `catchError((err)` / `error: (err) =>` — убрать параметр
(`catch {` — optional catch binding). Профилактор: `npm run lint` перед
каждым коммитом фронтовых правок. `if: always()` на publish-шаге **не**
спасает, когда файл физически не создан.

**Boundary.** Не путать с [dorny-reporter-junit](#dorny-reporter-junit) —
там XML есть, но `reporter` неверный.

---

<a id="npm-ci-prisma-preinstall"></a>

## `npm ci` падает на Prisma preinstall — это **не** peer-конфликт

**Symptom.** После удаления зависимости `npm ci` выдаёт «Prisma only supports
Node.js versions 20.19+/22.12+/24+»; ошибка принимается за ERESOLVE от
сбрасываемого пакета.

**Root cause.** Локальный shell на Node 23 (в то время как
[.nvmrc](../.nvmrc) = 24); preinstall-скрипт Prisma 7 проверяет версию Node и
падает раньше, чем npm доходит до peer-разрешения.

**Fix.** Проверять разрешимость graph'а отдельно:

```bash
npm ci --ignore-scripts       # пропускает preinstall
# или на целевой Node:
bash -lc 'source ~/.nvm/nvm.sh && nvm use 24 && cd backend && npm ci'
```

Окончательная проверка — всегда на Node из `.nvmrc`.

**Boundary.** Только для пакетов с preinstall-проверками. Не путать с
реальным ERESOLVE.

---

<a id="ssr-eventsource"></a>

## Angular SSR падает на `new EventSource` в конструкторе сервиса

**Symptom.** `npm run build` / prerender фронтенда:
`ReferenceError: EventSource is not defined`.

**Root cause.** `ssr: true` + `prerender: true` в
[`frontend/angular.json`](../frontend/angular.json) — Angular инъецирует
сервисы на сервере во время prerender'а; `EventSource` / `window` /
`localStorage` существуют **только** в браузере.

**Fix.** Оградить браузерный код через `isPlatformBrowser`:

```ts
@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(@Inject(PLATFORM_ID) platformId: object /* … */) {
    if (!isPlatformBrowser(platformId)) return;
    // SSE, setInterval, HttpClient calls
  }
}
```

То же верно для `localStorage` в `SessionService`. В Jest guard тоже нужен —
jsdom **не** знает `EventSource`; заглушка вынесена в
[`frontend/src/jest-globals.ts`](../frontend/src/jest-globals.ts) и
подключается через `setupFiles` (см.
[jest-setup-double-init](#jest-setup-double-init)).

---

<a id="nest-sse-type-field"></a>

## Nest `@Sse` + `type`: браузерный `onmessage` не ловит именованное событие

**Symptom.** Клиент подключается к SSE, сервер пишет сообщения, но
`es.onmessage` не вызывается.

**Root cause.** `SseMessageEvent` с полем `type: 'Date'` уходит как
**именованное** событие `event: Date\n`; браузерный `onmessage` срабатывает
только на событие по умолчанию (`message`). Плюс `data` проходит через
`JSON.stringify`, и `new Date()` уходит как `"2026-…"` в кавычках —
`new Date(e.data)` = `Invalid Date`.

**Fix.** Убрать `type`, отдавать структуру `{ time: new Date().toISOString() }`
и читать как `JSON.parse(e.data).time`. При необходимости поддержать
именованное событие — `es.addEventListener('Date', ...)` как fallback.

Пример —
[`backend/src/controllers/time.controller.ts`](../backend/src/controllers/time.controller.ts),
[`frontend/src/app/dashboard.service.ts`](../frontend/src/app/dashboard.service.ts).

---

<a id="jest-setup-double-init"></a>

## `@angular-builders/jest`: двойная инициализация TestBed

**Symptom.** `npm test` из frontend:
`Cannot set base providers because it has already been called`.

**Root cause.** `@angular-builders/jest` уже вызывает `setupZoneTestEnv`
внутри; добавление `jest-preset-angular/setup-jest` в `setupFilesAfterEach`
или в `setupFiles` инициализирует зону вторично.

**Fix.** **Не** дублировать setup-файл `jest-preset-angular`. Свой stub
(`EventSource`, `matchMedia`) — в `setupFiles`, **не** в
`setupFilesAfterEach`. Если нужен `setupFilesAfterEach` — пользовательский,
не preset'овский.

**Boundary.** Пока `@angular-builders/jest@19` + `jest-preset-angular@14` —
паттерн не меняется.

---

<a id="prisma-7-seed"></a>

## Prisma 7 + генератор `prisma-client`: сид нужен NestJS-сервисом

**Symptom.** Standalone `prisma/seed.mjs` / `prisma/seed.ts` не резолвит
`s../generated/prisma/client.js` (проблема ESM → .ts). Даже через `tsx`
падает на `new PrismaClient(...)` → «Expected arguments: 1, got 0».
Отдельно — `nest start --env-file=.env` молча игнорирует флаг, сид читает
`process.env.ADMIN_EMAIL === undefined`.

**Root cause.**

1. Генератор `prisma-client` в Prisma 7 кладёт **`.ts`**-исходники в
   `src/generated/prisma`, чистый Node не умеет их резолвить; конструктор
   `PrismaClient` требует `PrismaPg`-адаптер (`new PrismaPg({ connectionString })`).
2. `nest start` не пробрасывает Node-флаги дочернему процессу; нужен явный
   `node --env-file=.env …`.

**Fix.**

- Сид — **NestJS-сервис** с `OnApplicationBootstrap`
  ([`backend/src/seed/seed.service.ts`](../backend/src/seed/seed.service.ts));
  регистрация в `AppModule`.
- Пароли — через `scrypt` из
  [`backend/src/utils/hashPassword.ts`](../backend/src/utils/hashPassword.ts).
- Dev-скрипт — `node --env-file=.env node_modules/.bin/nest start`;
  prod — `node --env-file=.env dist/main.js`. См.
  [decisions.md#node---env-file](decisions.md#node---env-file).

**Boundary.** Не применимо к legacy-генератору `prisma-client-js`, где
`@prisma/client` реэкспортирует клиент и `.mjs`-сид работает.

---

<a id="e2e-env-setup-file"></a>

## `.env` в e2e грузится через `test/setup-env.ts`; юниты — нет

**Symptom.** e2e падает: «ADMIN_API_KEY is not set; the e2e suite needs
it…»; юниты зелёные.

**Root cause.** `dotenv`-загрузка `.env` в TypeScript-коде проекта происходит
только в **двух** местах (ни одно не относится к рантайму Nest):

- [`backend/prisma.config.ts`](../backend/prisma.config.ts) — `import
'dotenv/config'` для Prisma CLI (generate/migrate).
- [`backend/test/setup-env.ts`](../backend/test/setup-env.ts) —
  `dotenv.config({ path: resolve(import.meta.dirname, '../.env') })`
  абсолютным путём, подключён через `setupFiles: ['test/setup-env.ts']` в
  [`vitest.config.e2e.ts`](../backend/vitest.config.e2e.ts). **Юниты**
  ([`vitest.config.ts`](../backend/vitest.config.ts)) его не загружают.

`dotenv` по умолчанию **не** перезаписывает уже выставленные `process.env` —
`ADMIN_API_KEY` / `E2E_BASE_URL` из shell/CI имеют приоритет.

**Fix.** e2e полагаются на `backend/.env`; если файла нет — `dotenv.config()`
молча ничего не загружает, и `ActivityHelper.adminApiKey()` падает с явной
ошибкой. Перед прогоном — `cp backend/.env.example backend/.env` (делается
`start-dev.sh` / `start-prod.sh`).

**Boundary.** Только e2e-Vitest. Runttime-процесс Nest dotenv **не**
использует — там `node --env-file`.

---

<a id="verify-password-rangeerror"></a>

## `verifyPassword` бросает `RangeError`, а не `false`, на битом hex-хэше

**Symptom.** Тест/код ждёт `expect(verifyPassword('pw', 'not-hex:not-hex')).toBe(false)`,
но получает `RangeError: Input buffers must have the same byte length` из
`crypto.timingSafeEqual`.

**Root cause.** [`backend/src/utils/hashPassword.ts`](../backend/src/utils/hashPassword.ts)
парсит `storedHash.split(':')` → `Buffer.from(hash, 'hex')`. Node обрезает
строку до первого невалидного hex-символа, поэтому «мусор» даёт пустой буфер;
`scryptSync(...)` возвращает 64 байта, и `timingSafeEqual(64, 0)` кидает
`RangeError` вместо `false`.

**Fix.** В юнитах использовать `await expect(...).toThrow(RangeError)` (или
синхронный `expect(() => verifyPassword(...)).toThrow(RangeError)`) для
заведомо невалидных stored-hash значений; контракт «вернуть false» гарантирован
только для `null`/`undefined`/`''`/осмысленного `salt:hash` формата. Правку
самого utils (guard на длину буфера) держать в BACKLOG как отдельный
независимый fix — сейчас не делается, чтобы не ломать существующие тесты.

**Boundary.** Только `verifyPassword` в этом проекте. Другой вызов
`timingSafeEqual` в коде — не затронут.

**См. также:** решение не тянуть bcrypt —
[decisions.md](decisions.md#scrypt-not-bcrypt).
