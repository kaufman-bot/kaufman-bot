# Service Layer Split — Entity CRUD vs. Use-Case Services

## Rule

Backend services in `backend/src/services/` are separated by
**responsibility**, not by domain name. Two kinds of services exist and
must not be merged:

1. **Entity-CRUD services** — plain persistence on a single Prisma
   model: `list / get / update / remove`. They know nothing about
   business flows, they do not compose other services, and their return
   type is the entity's DTO.
2. **Use-case services** — one multi-step scenario that may touch
   several entities, call other services, run validation, and issue
   side effects (e.g. key creation). Named after the _action_, not
   after the model.

Do **not** add a use-case method to an entity-CRUD service just because
the flow "mostly" touches that entity. Do **not** put trivial CRUD
inside a use-case service.

## Why

- Registration is not "create a User row". It validates email + password,
  checks uniqueness, hashes the password with scrypt, creates the User,
  and issues the first API key. That belongs in `AuthService.register`,
  not in `UsersService.create`.
- Profile is not "read a User row". It composes the User with the
  ApiKey presented by `ApiKeyGuard`. That belongs in
  `AuthService.profile`, not in a User getter.
- Splitting makes each service independently testable and keeps the
  Prisma model changes from leaking into flow logic.
- The user explicitly requested this shape:
  _"регистрация — не CRUD-операция, вынеси в отдельный сервис"_.

## Reference layout

| Concern                                                 | Home                   | Not                                   |
| ------------------------------------------------------- | ---------------------- | ------------------------------------- |
| Account rows (list/get/update/remove, `AdminUserDto`)   | `UsersService`         | `AuthService`, `AdminUsersController` |
| API-key rows (create/list/update/deleteForUser)         | `ApiKeysService`       | `AuthService`                         |
| Register (email + password + first key)                 | `AuthService.register` | `UsersService.register`               |
| `GET /auth/me` profile (User + ApiKey)                  | `AuthService.profile`  | `UsersService.me`                     |
| Bot reply flow (`replyAsBot(userId, content, buttons)`) | `MockBotService`       | `UsersService`, `MessageService`      |
| Button-preset CRUD scoped to caller                     | `ButtonPresetsService` | `MockBotService`                      |
| Chat history, send message, button callback             | `ChatService`          | `UsersService`                        |
| Plugin dispatch (BOT_PLUGINS token aggregation)         | `BotPluginsService`    | `ChatService`                         |

## Validation constants live next to the flow that uses them

- `EMAIL_REGEX`, `MIN_PASSWORD_LENGTH`, `DEFAULT_KEY_NAME` are declared
  in the file that consumes them (`auth.service.ts`, `api-keys.service.ts`)
  or, if they truly cross services, under `backend/src/constants/`.
- Do not scatter shared validation into a global helper until at least
  two callers exist.

## Registration in `AppModule`

Every service is a plain provider in `backend/src/app.module.ts`:

```ts
@Module({
  // ...
  controllers: [
    /* controllers in dependency order */
  ],
  providers: [
    PrismaService,
    SeedService,
    AuthService,
    UsersService,
    ApiKeysService,
    ChatService,
    ChatEventsService,
    MockBotService,
    ButtonPresetsService,
    BotPluginsService,
    // ... plugin classes and the BOT_PLUGINS useFactory aggregator
  ],
})
export class AppModule {}
```

There is **exactly one** Nest module in the project — `AppModule`
itself. See the `backend-module-topology` skill for the full rule and
for how wrapper modules (`PrismaModule`, `SeedModule`) are being phased
out.

## Adding a new feature

Ask in this order:

1. Is the new operation a **plain persistence** step on one model?
   → extend that model's entity-CRUD service.
2. Is it a **multi-step scenario** with side effects or cross-entity
   composition? → extend the relevant use-case service, or add a new
   one named after the verb.
3. Do two services need to cooperate? → one calls the other via
   constructor injection; do not duplicate logic.
4. Is the flow an SSE stream, plugin dispatch, or cron-style sweep?
   → those already have dedicated services (`ChatService.streamEvents`,
   `BotPluginsService.dispatch` + `sweep`); extend them, do not
   reimplement.

## Forbidden patterns

| Anti-pattern                                                                           | Why                                                                                    |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `UsersService.register(email, password)` that internally calls `ApiKeysService.create` | Use-case logic inside an entity-CRUD service; makes `UsersService` hard to test        |
| `AuthService.list()` returning every user                                              | `list` is a Users concern; `AuthService` should stay focused on flows behind `/auth/*` |
| Cross-service duplicate validation constants                                           | Drift risk; pick the file where the flow lives                                         |
| Wrapping two services into a third just to call both                                   | Introduce the use-case explicitly, name it after the scenario                          |

## Self-check

Before adding a service method:

```bash
# Where does this method name already appear?
grep -RnE 'class (Auth|Users|ApiKeys|Chat|MockBot|ButtonPresets|BotPlugins)Service' backend/src/services
```

If you are about to add `createX` / `listX` / `updateX` / `removeX`, the
entity-CRUD service for `X` is the home. If you are about to add a
method with a _noun + verb_ name (`register`, `login`, `replyAsBot`,
`submitButtonCallback`, `dispatchForUser`), that is a use-case: find the
flow service (or create a new one).

## Related files

| File                                              | Role                                                  |
| ------------------------------------------------- | ----------------------------------------------------- |
| `backend/src/services/auth.service.ts`            | Reference use-case service (`register`, `profile`)    |
| `backend/src/services/users.service.ts`           | Reference entity-CRUD service (list/get/patch/remove) |
| `backend/src/services/api-keys.service.ts`        | Reference entity-CRUD service for keys                |
| `backend/src/services/chat.service.ts`            | Reference use-case service with cross-entity work     |
| `backend/src/services/mock-bot.service.ts`        | Reference use-case (operator reply with buttons)      |
| `backend/src/services/button-presets.service.ts`  | Reference entity-CRUD with owner-scope                |
| `backend/src/app.module.ts`                       | Sole Nest module; provider list                       |
| `.agents/skills/backend-module-topology/SKILL.md` | Companion rule: one module, BACKLOG for debt          |
