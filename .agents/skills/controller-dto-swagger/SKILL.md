# Controller DTO & Swagger — API Contract Rule

## Rule

**Every controller handler must accept and return DTO classes decorated with Swagger
decorators (`@ApiProperty`, etc.) — never raw interfaces, primitives, or inline object
types.** This applies to every new controller AND to all existing ones whenever they are
touched. Swagger UI at `/swagger` (see `backend/src/main.ts`) must describe real schemas
from `components.schemas`.

## Why

- Raw primitives (`string`, `Date`) and inline interfaces produce empty or missing schemas
  in OpenAPI — the `/swagger.json` contract becomes useless for clients.
- DTO classes are the only entities `@nestjs/swagger` can emit into `components.schemas`.
- A single typed contract class is reused by controller, service and tests, keeping the
  API shape honest and refactor-safe.

## Conventions

| Aspect       | Convention                                                                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DTO location | `backend/src/dto/<feature>.dto.ts` (e.g. `time.dto.ts`, `health.dto.ts`)                                                                                                                                                                                         |
| Services     | `backend/src/services/<name>.service.ts` — one service per entity holds that entity's CRUD; a multi-step use case (e.g. `AuthService.register` = validate + create account + issue its first key) gets its own service instead of being bolted onto the CRUD one |
| Naming       | `<Feature>Dto` for responses, `<Action><Thing>Dto` for bodies (e.g. `CreateUserDto`)                                                                                                                                                                             |
| Field docs   | `@ApiProperty({ description, example })` on **every** field; `format: 'date-time'` for dates; `enum: [...]` for literal unions                                                                                                                                   |
| Imports      | `.js` extensions (ESM/nodenext): `import { X } from '../dto/x.dto.js'`                                                                                                                                                                                           |
| Comments     | English                                                                                                                                                                                                                                                          |

## Handler Checklist

For each handler:

1. `@ApiTags('<feature>')` on the controller class.
2. `@ApiOperation({ summary })` on the method.
3. `@ApiOkResponse({ type: <ResponseDto> })` (and `@ApiResponse({ status, type })` for
   other codes) — matching the method's declared return type.
4. Return type is the DTO class (`Dto`, `Promise<Dto>`, or `Observable<SseMessageEvent<Dto>>`).
5. Incoming payloads use a DTO class as the `@Body()`/query param type with
   `@ApiProperty` on each field.
6. Objects built inline (e.g. mapped from `os.*` / Prisma) use `satisfies <Dto>` or a
   `const x: <Dto> = {...}` annotation to stay type-checked.

### Simple DTOs (single value / payload)

Use a class with an explicit constructor: `new ServerTimeDto(new Date())`. Keep one
unified value format across REST and SSE endpoints of the same feature (e.g. server time
is always an ISO-8601 `string` field, serialized in the DTO constructor via
`toISOString()`).

### Aggregate DTOs (nested data from many sources)

Nest small DTO classes (`DatabaseStatusDto`, `MemoryInfoDto`, ...) referenced via
`@ApiProperty({ type: ... })`; mark the root with `@ApiExtraModels(...)` when nested
types must appear in `components.schemas`. Build with `satisfies` instead of a
constructor.

### SSE handlers

`@nestjs/common`'s `MessageEvent` is **not generic**. Use
`SseMessageEvent<T>` from `backend/src/interfaces/sse-message-event.ts` as the observable
payload: `Observable<SseMessageEvent<EventDto>>`. Document the stream with
`@ApiOkResponse({ type: EventDto })` (the event payload schema then appears in
`components.schemas` via `$ref`); if the payload DTO is not referenced by any other
handler, register it with `@ApiExtraModels(EventDto)` on the controller.

## Verification

After changing controllers/DTOs:

```bash
cd backend
node_modules/.bin/tsc --noEmit -p tsconfig.build.json --skipLibCheck
node_modules/.bin/oxlint src/
node_modules/.bin/prettier --check src/
# with dev server running:
curl -s http://localhost:3000/swagger-json | node -e "..." # check components.schemas
```

The generated `swagger.json` (git-ignored) must contain the DTO schemas under
`components.schemas`, and every path operation must reference them via `$ref`.

## If response body shape changes

Frontend consumers (`frontend/src/app/dashboard.service.ts`) and backend tests must be
updated in the same change.

## Regenerate the e2e SDK after any contract change

The e2e suite (`backend/test/*.e2e-spec.ts`) does not boot the Nest app: it calls
the real running backend through the OpenAPI-generated SDK in
`backend/test/generated/client` (`openapi-ts.config.ts`). After adding/renaming
controllers, operations, DTO fields or `@Api*` decorators:

```bash
cd backend
npm run start:dev            # boots backend and rewrites ./swagger.json
npm run generate:openapi-ts  # swagger.json -> test/generated/client
npm run test:e2e             # hits the running backend (E2E_BASE_URL override)
```

Contract details that leak into the SDK, so declare them explicitly:

- `@ApiHeader`/`@ApiQuery` decide whether the generated operation requires headers/query.
- Error bodies need a DTO (`@ApiUnauthorizedResponse({ type: ApiErrorDto })`),
  otherwise the SDK types them as `unknown`.
- Time/other scalars keep the DTO rule (`ServerTimeDto { time: string }`).

## E2E fixtures come from the API, never from the database

Tests may not open a Prisma client (or any other DB connection) to prepare data. If a
scenario needs a user, an expired key or a deactivated account, there must be a
controller method that creates that state over HTTP — add the missing endpoint instead
of writing to the tables.

The current surface used by fixtures (see `backend/test/utils/fixtures.ts`):

| Need                             | Endpoint                                          |
| -------------------------------- | ------------------------------------------------- |
| New account + first key (secret) | `POST /api/v1/auth/register`                      |
| Key with past/blank expiry, off  | `POST /api/v1/api-keys` (`expiresAt`, `isActive`) |
| Rename/(de)activate/revoke a key | `PATCH`, `DELETE /api/v1/api-keys/{id}`           |
| Deactivate or promote an account | `PATCH /api/v1/admin/users/{id}` (ADMIN key)      |
| Tear down everything created     | `DELETE /api/v1/admin/users/{id}` (keys cascade)  |

Rules followed by those endpoints:

- Business validation lives in services (`AuthService`, `UsersService`, `ApiKeysService`) and is
  expressed as `BadRequest`/`Conflict`/`Forbidden`/`NotFound` — every one of them typed
  with `ApiErrorDto` so the SDK exposes readable assertions.
- Secrets are revealed only in the create/registration response; every read masks them.
- Teardown uses the ADMIN key from `ADMIN_API_KEY` (environment), so the suite leaves
  no rows behind.

## File Locations

| File                                          | Purpose                                              |
| --------------------------------------------- | ---------------------------------------------------- |
| `backend/src/dto/*.dto.ts`                    | API contract DTO classes with `@ApiProperty`         |
| `backend/src/interfaces/sse-message-event.ts` | Generic SSE event wrapper for `@Sse`                 |
| `backend/src/controllers/*.ts`                | Handlers with `@Api*` decorators                     |
| `backend/src/main.ts`                         | `DocumentBuilder` + `SwaggerModule.setup('swagger')` |
| `backend/src/services/*.service.ts`           | Business logic + validation behind the handlers      |
| `backend/openapi-ts.config.ts`                | Generates the e2e SDK from `swagger.json`            |
| `backend/test/generated/client/`              | Generated SDK used by `ActivityHelper`               |
| `backend/test/utils/fixtures.ts`              | HTTP-only test data recipes (no DB access)           |
