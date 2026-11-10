# Тестирование

Четыре независимых набора, каждый со своим runner'ом и своим контрактом
запуска. Документ фиксирует правила, которые нельзя нарушать при добавлении
новых тестов.

| Набор         | Runner             | Расположение                 | Цель                                    |
| ------------- | ------------------ | ---------------------------- | --------------------------------------- |
| Backend unit  | Vitest             | `backend/src/**/*.spec.ts`   | Чистые функции, сервисы, DTO, утилиты   |
| Backend e2e   | Vitest (отдельный) | `backend/test/*.e2e-spec.ts` | HTTP-контракт против **живого** бэкенда |
| Frontend unit | Jest               | `frontend/src/**/*.spec.ts`  | Компоненты, сервисы, интерцепторы       |
| Frontend e2e  | Playwright         | `frontend/e2e/*.spec.ts`     | Реальный Chromium против прод/dev-стека |

Актуальные счётчики на момент написания: backend unit **126/126**, backend
e2e **104/104**, frontend Jest **90/90**.

## 1. Backend unit — Vitest

Конфиг [`backend/vitest.config.ts`](../backend/vitest.config.ts):

```ts
{ plugins: [tsconfigPaths()], test: { include: ['**/*.spec.ts'],
  reporters: ['default','junit'], outputFile: { junit: './test-results/junit.xml' } } }
```

Запуск из `backend/`:

```bash
npm test                 # npx vitest run
npm run test:watch
npm run test:cov
npx vitest run src/utils/hashPassword.spec.ts   # изолированно
```

Правила:

- **`*.e2e-spec.ts` не входит** в `**/*.spec.ts` — у e2e отдельный конфиг
  [`vitest.config.e2e.ts`](../backend/vitest.config.e2e.ts) с
  `include: ['**/*.e2e-spec.ts']`.
- Каждый новый unit-спеk форматируется `prettier --write` до коммита, иначе
  pre-commit hook ругается.
- Если unit-спеk зависит от сгенерированного Prisma Client — это **не**
  повод писать `npx prisma generate` в тесте; сначала проверьте, можно ли
  замокать (`vi.mock('../prisma/prisma.service.js')`) — иначе тесты
  замедляются.

## 2. Backend e2e — OpenAPI SDK против живого бэкенда

**Ключевое правило.** e2e-тесты `backend/test/*.e2e-spec.ts` **не** поднимают
Nest-приложение и **не** ходят в БД напрямую:

```
❌ Test.createTestingModule / createNestApplication
❌ new PrismaClient()
✅ HTTP через сгенерированный @hey-api/openapi-ts SDK
✅ baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
```

Фикстуры **только** через контроллеры:

| Операция                                            | Эндпоинт                                                |
| --------------------------------------------------- | ------------------------------------------------------- |
| Создать аккаунт + первый ключ                       | `POST /api/v1/auth/register`                            |
| Выпустить ключ (в т.ч. expired / disabled / future) | `POST /api/v1/api-keys`                                 |
| Деактивировать аккаунт                              | `PATCH /api/v1/admin/users/:id` (`{ isActive: false }`) |
| Promote → ADMIN                                     | `PATCH /api/v1/admin/users/:id` (`{ role: 'ADMIN' }`)   |
| Удалить аккаунт (teardown)                          | `DELETE /api/v1/admin/users/:id` ключом `ADMIN_API_KEY` |
| Сид-админ (для операций над тестовыми)              | `ADMIN_API_KEY` из `backend/.env`                       |

Если состояние нельзя создать эндпоинтом — **эндпоинт надо добавить**, а не
писать `prisma.*` прямо в тест.

### Общий хелпер — `ActivityHelper`

[`backend/test/utils/activity-helper.ts`](../backend/test/utils/activity-helper.ts):

- **Stateful**. `client.setConfig({ headers: { 'x-api-key': … } })` меняет
  заголовок на уровне **всего** клиента, а не одного вызова. Значит — один
  инстанс = один API-ключ. Смешивать identities в одном экземпляре нельзя
  (см. [`pitfalls.md#activity-helper-stateful`](pitfalls.md#activity-helper-stateful)).
- Методы: `loginByApiKey`, `loginAsAdmin`, `logout`, `registerAccount(email)`,
  `issueKey(body)`, `removeAccountAsAdmin(id)`, `ensureBackendRunning()`,
  `adminApiKey()` (static), `isoFromNow(ms)` (static).
- Читает SSE через `client.sse.get({ signal })` с `AbortController`.
- В `test/utils/api-result.ts` остаются только читатели `messageOf` /
  `unwrap`; отдельные `fixtures.ts` / `ensure-backend.ts` **не** плодим.

### E2E hygiene — сид-админ неприкосновенен

Полное правило —
[`e2e-fixture-hygiene`](../.agents/skills/e2e-fixture-hygiene/SKILL.md).
Суть: `ADMIN_API_KEY` из `backend/.env` — **боевой** ключ. Его пресеты,
пользователи и ключи живут в проде и **не** должны удаляться в `afterAll`.

- Разрешено сид-админу: `registerAccount`, `PATCH /admin/users/:id`, `DELETE
/admin/users/:id` **по test-spawned id**.
- Запрещено сид-админу: любые CRUD-вызовы, которые enumerate-ят или чистят
  его **собственные** данные (кнопки, ключи, пресеты).
- Для CRUD-проверок с двумя ADMIN-ролями используйте **spawn- ADMIN** через
  `spawnAdmin(tag)`:
  ```ts
  async function spawnAdmin(tag: string) {
    const reg = await admin.registerAccount(`${tag}-${Date.now()}@test.local`);
    await admin.sdk.adminUsersControllerUpdateV1({
      path: { id: reg.user.id },
      body: { role: 'ADMIN' },
    });
    return { userId: reg.user.id, apiKey: reg.apiKey.key };
  }
  ```
- `afterAll` проходит только по `[adminA, adminB]` (своим spawn-нутым);
  сид-админ **не** enumerates.

Самопроверка:

```bash
grep -RnE 'admin\.sdk\.[a-zA-Z]+(Remove|Delete|Update|Create)V1' \
  backend/test/*.e2e-spec.ts
```

Все найденные хиты должны относится к register / promote / removeAccount по
test-spawned id.

### Запуск

```bash
# 1. Инфраструктура + бэкенд
npm run start:dev          # бэкенд живёт на :3000, пишет swagger.json

# 2. (опционально) перегенерировать SDK после изменения контракта
cd backend && npm run generate:openapi-ts && cd ..

# 3. Прогон
cd backend && npm run test:e2e
```

Конфиг [`backend/vitest.config.e2e.ts`](../backend/vitest.config.e2e.ts):

```ts
{ setupFiles: ['test/setup-env.ts'],
  include: ['**/*.e2e-spec.ts'],
  passWithNoTests: true,
  reporters: ['default', 'junit'],
  outputFile: { junit: './test-results/e2e-junit.xml' } }
```

[`test/setup-env.ts`](../backend/test/setup-env.ts) разово грузит
`backend/.env` (для `ADMIN_API_KEY`). Если файл отсутствует — бэкенд тоже не
запустится, но сам e2e-прогон упадёт **неявно**; убедитесь, что `.env`
создан.

### Перегенерация SDK после правки контракта

```
1. Изменить DTO/контроллер (skill: controller-dto-swagger)
2. npm run start:dev          (backend перезапишет swagger.json)
3. npm run generate:openapi-ts  (backend/test/generated/client)
4. npm run test:e2e           (прогнать против живого бэкенда)
```

Сгенерированный SDK **в VCS** — чтобы `npm run test:e2e` работал на свежем
клоне без предварительной генерации; в `.prettierignore` добавлен.

## 3. Frontend unit — Jest

Конфиг
[`frontend/jest.config.js`](../frontend/jest.config.js) использует
`@angular-builders/jest` (не `jest-preset-angular/setup-jest` в
`setupFilesAfterEach` — двойная инициализация TestBed ломает `npm test`;
исправлено, не возвращаться).

```bash
cd frontend
npm test                     # jest
npm run test:watch
```

Важное:

- `testPathIgnorePatterns: ['<rootDir>/e2e/']` — иначе Jest подбирает
  `*.spec.ts` из Playwright-каталога и падает.
- Jasmine-ассерты `toBeTrue/toBeFalsy` не работают — заменять на
  `toBe(true)` / `toBe(false)`.
- `EventSource` мокается; для SSE-теста использовать `new Subject()` (не
  `of()`), иначе `of` эмитит синхронно **до** того, как компонент
  подпишется.

## 4. Frontend e2e — Playwright

Конфиг
[`frontend/playwright.config.ts`](../frontend/playwright.config.ts):

- `testDir: './e2e'` (спеки `frontend/e2e/*.spec.ts`).
- `baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'` — по
  умолчанию прод.
- `workers: 1`, `fullyParallel: false` — пишут в одну живую БД через UI.
- `retries: CI ? 1 : 0`.
- Отчёты: `list`, `junit → test-results/e2e-junit.xml`,
  `html → test-results/playwright-report`. Артефакты (скрины/трейсы) в
  `test-results/e2e-artifacts`.

Скрипты:

| Команда                    | Что делает                                                                        |
| -------------------------- | --------------------------------------------------------------------------------- |
| `npm run test:e2e`         | Playwright с baseUrl по умолчанию (прод-стек на `:3000`)                          |
| `npm run test:e2e:prod`    | То же + `start:prod` в начале                                                     |
| `npm run test:e2e:dev`     | `E2E_BASE_URL=http://localhost:4200` — ng serve с прокси `/api` + backend `:3000` |
| `npm run test:e2e:install` | Ставит Chromium **без** `--with-deps` (требует sudo)                              |

**Ловушка.** Если бэкенд на `:3000` запущен **в dev-режиме** (без
`NODE_ENV=production`), ServeStatic **не** подключается, `GET /` → 404, и
спека дашборда падает по таймауту. Для неё нужен либо prod-стек, либо
переход на `:4200`.

## 5. CI / GitHub Actions

- **`ci.yml`** — push/PR в `main`:
  1. `npm ci` в root/backend/frontend.
  2. Линты, сборки, unit-тесты (backend Vitest + frontend Jest).
  3. Публикация JUnit через `dorny/test-reporter` из
     `backend/test-results/junit.xml` и `frontend/test-results/junit.xml`.
- **`e2e-prod.yml`** — manual dispatch:
  1. `npm run install:all` + `start:prod`.
  2. Backend e2e (`npm run test:e2e` из `backend/`).
  3. Frontend e2e (`npm run test:e2e` из `frontend/`).
  4. Публикация JUnit и артефактов.
  5. `stop:prod` **с** `continue-on-error: true` — иначе cleanup-шаг
     красит джоб при уже случившемся падении (см.
     [`pitfalls.md#github-actions-cleanup-exit1`](pitfalls.md#github-actions-cleanup-exit1)).

Второй `actions/checkout` на другой ref в e2e-prod заменён на `git fetch +
git archive` из-за gitlink-проблемы сабмодуля — см.
[`pitfalls.md#github-actions-gitlink`](pitfalls.md#github-actions-gitlink).

## 6. Диагностика e2e

Порядок отладки, когда тест падает:

1. **Бэкенд жив?** `curl -sI http://localhost:3000/api/v1/health` → `200`.
   Если нет — `ActivityHelper.ensureBackendRunning()` даёт внятное сообщение;
   стартуйте `npm run start:dev`.
2. **SDK актуален?** Если контракт менялся, перегенерируйте
   `npm run generate:openapi-ts` **до** прогона; иначе TS не скомпилируется
   или запрос уйдёт по старому пути.
3. **Рантайм-логи Nest?** `pm2 logs kaufman-bot-backend --nostream`. Это
   **быстрее**, чем вчитываться в ответ SDK: 500-ые и ошибки DI (`this.plugins
.find is not a function`) видны только там.
4. **Данные в БД?** MCP `postgres` (`query`) — read-only инспекция: `SELECT
email, count(bp.id) FROM users u LEFT JOIN button_presets bp ON bp."ownerId"
= u.id GROUP BY u.email;`. **Не** меняйте данные руками.

## Источники

| Файл                                                                                                           | Роль                                           |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [`backend/vitest.config.ts`](../backend/vitest.config.ts)                                                      | Unit-конфиг                                    |
| [`backend/vitest.config.e2e.ts`](../backend/vitest.config.e2e.ts)                                              | E2E-конфиг                                     |
| [`backend/test/setup-env.ts`](../backend/test/setup-env.ts)                                                    | `dotenv` для e2e                               |
| [`backend/test/utils/activity-helper.ts`](../backend/test/utils/activity-helper.ts)                            | Stateful SDK-обёртка + fixture-хелпер          |
| [`backend/openapi-ts.config.ts`](../backend/openapi-ts.config.ts)                                              | Конфиг генератора SDK                          |
| [`frontend/jest.config.js`](../frontend/jest.config.js)                                                        | Jest-конфиг + ignore e2e                       |
| [`frontend/playwright.config.ts`](../frontend/playwright.config.ts)                                            | Playwright baseURL / reporters                 |
| [`.agents/skills/e2e-fixture-hygiene/SKILL.md`](../.agents/skills/e2e-fixture-hygiene/SKILL.md)                | Запрет трогать сид-админа + spawnAdmin pattern |
| [`.agents/skills/controller-dto-swagger/SKILL.md`](../.agents/skills/controller-dto-swagger/SKILL.md)          | Контракт, из которого растёт SDK               |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), [`e2e-prod.yml`](../.github/workflows/e2e-prod.yml) | CI-контракт                                    |
