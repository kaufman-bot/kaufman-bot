<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Web Chat with Mock Bot

This project includes a web chat system where users can communicate with a mock bot through a web interface, and operators can manage conversations through a console.

### Features

- **User Chat** (`/chat`): Web interface for users to send messages to the bot and receive real-time responses via SSE (Server-Sent Events)
- **Mock Bot Console** (`/mock-bot`): Operator interface to view all conversations, read messages, and reply on behalf of the bot
- **API Key Authentication**: Secure access using API keys with role-based permissions (USER/ADMIN)
- **Real-time Updates**: SSE streams for instant message delivery without page reloads

### API Endpoints

#### Authentication

- `POST /api/v1/auth/login` — Login with API key, returns user profile (`language` included)
- `GET /api/v1/auth/me` — Profile behind the presented API key
- `PATCH /api/v1/auth/me` — Self-service profile update (body: `{ timezone?: string | null, language?: 'en' | 'ru' | null }`; an IANA time zone, `null` clears it; `language` is validated against the supported set — anything else is `400`, an omitted field keeps the stored value)

#### User Chat (requires USER or ADMIN role)

- `GET /api/v1/chat/messages` — Get message history for the authenticated user's conversation (`kind: BUTTON` callbacks are filtered out)
- `POST /api/v1/chat/messages` — Send a message to the bot (body: `{ content: string }`)
- `POST /api/v1/chat/button-callbacks` — Notify the server that an inline keyboard button was pressed (body: `{ callbackData: string }`, up to 256 chars, returns 201 with the persisted `kind: BUTTON` message; the response must NOT be appended to the user's local chat list — a plugin that opted into callbacks replies as an ordinary `BOT` message over SSE)
- `GET /api/v1/chat/stream` — SSE stream for real-time messages (use `?apiKey=` query param); events with `kind: BUTTON` are suppressed for the user subscriber

#### Mock Bot Console (requires ADMIN role)

- `GET /api/v1/mock-bot/conversations` — List all user conversations with unread counts
- `GET /api/v1/mock-bot/conversations/:userId/messages` — Get messages for a specific user's conversation (the operator sees every message, including `kind: BUTTON` callbacks the user pressed)
- `POST /api/v1/mock-bot/conversations/:userId/messages` — Reply as bot (body: `{ content?: string, buttons?: KeyboardButtonDto[] }`; at least one of the two must be non-empty, otherwise 400)
- `GET /api/v1/mock-bot/stream` — SSE stream for all conversation events (use `?apiKey=` query param)
- `GET /api/v1/mock-bot/presets` — List the calling admin's button presets
- `POST /api/v1/mock-bot/presets` — Create a preset (body: `{ name: string, buttons: KeyboardButtonDto[] }`, 201)
- `PATCH /api/v1/mock-bot/presets/:id` — Update caller-owned preset (body: partial `{ name?, buttons? }`, 200; foreign ids → 404)
- `DELETE /api/v1/mock-bot/presets/:id` — Delete caller-owned preset (204; already-sent messages keep their button snapshot; foreign ids → 404)

### Environment Variables

Add these to `backend/.env` to seed default users on startup:

```bash
# User 1 (regular USER role)
USER1_EMAIL=user1@example.com
USER1_PASSWORD=password123
USER1_API_KEY=sk-user1-key-here

# User 2 (regular USER role)
USER2_EMAIL=user2@example.com
USER2_PASSWORD=password456
USER2_API_KEY=sk-user2-key-here
```

The `SeedService` will automatically create these users and their API keys on application startup. If variables are missing, a warning is logged and the user is skipped.

## Bot Plugins

Reactions to user chat messages live in pluggable services (`backend/src/plugins/`), not in the chat core. Every plugin:

- implements the single `BotPlugin` interface from `bot-plugin.interface.ts` — `name`, `canHandle(content, kind)` (exact, trimmed, case-insensitive matching is up to the plugin) and `handle({ user, content, kind })` returning either reply text or `{ text, buttons }` when the reply carries an inline keyboard;
- declares `handlesCallbacks = true` only if it also wants pressed inline buttons; without it a button payload is never offered to the plugin, so a payload colliding with a text trigger (e.g. `ping`) stays silent;
- is registered in `AppModule` as its own provider and added to the `inject` list of the single `BOT_PLUGINS` factory — Nest does not merge several providers of one token into an array, so the token is aggregated once via `useFactory`; the `inject` order is the dispatch priority.

`kind` is `TEXT` for a typed message and `BUTTON` for a pressed button (its `callbackData` arrives as `content`).

When a user sends a chat message or presses a button, `ChatService` hands it to the plugin dispatcher (`BotPluginsService`): the first plugin whose `canHandle` matches produces the reply, which is persisted as a `BOT` message and delivered over the chat SSE stream like any other bot reply. Buttons of a reply are validated with the same rules as operator keyboards (`validateButtons` / `normalizeButtons`) and stored as an immutable snapshot on the message row; an invalid reply is logged and sends nothing. A plugin failure never fails the user's own message; plugin order in `AppModule` is the dispatch priority.

Built-in plugins:

- **PingPongPlugin** — replies `pong` to a `ping` message;
- **TimePlugin** — replies with the current server time formatted in the user's IANA time zone (falls back to UTC when unset), e.g. `2026-11-01 12:34:56 (Europe/Moscow)`;
- **SettingsPlugin** — `/settings` shows the user's settings screen with the active language and one button per supported language (the current one marked with `✓ `); pressing `settings:language:en|ru` stores the language and confirms the change in the language that just became active. The whole `settings:language:` payload namespace belongs to this plugin, so a button carrying a code outside the supported set (`settings:language:de`, an empty code, a list of codes) answers with a refusal naming the code and the available languages, written in the language that stayed active, and the stored language is left untouched. Payloads of other namespaces (`ping`, `presets:123`, `settings:lang:en`) are not claimed and stay silent.

The user time zone is stored on the `User` row (`timezone`, nullable). The frontend syncs the browser time zone automatically after login/session restore via `PATCH /api/v1/auth/me`; the value can also be updated manually with the same endpoint.

The active language is stored on the same row (`language`, enum `en`/`ru`, default `en` — existing rows got it from the migration default). It is returned by `GET /auth/me`, `POST /auth/login` and `POST /auth/register` and can be updated either via `PATCH /api/v1/auth/me` or by pressing a language button in the `SettingsPlugin` chat screen.

To add a new plugin: create a class implementing `BotPlugin` in `backend/src/plugins/`, register it as a plain provider in `AppModule` and add it to the `inject` list of the `BOT_PLUGINS` factory (order = priority), and cover its behavior with unit tests next to the file.

### Reliable delivery across restarts

Plugin dispatch is crash-safe — the server may be restarted at any moment (dev watch, deploys, worker crashes) without losing messages or interrupting processing:

- **Acceptance is atomic**: `ChatService.sendMessage` creates the user message and its dispatch task (`BotPluginTask`, outbox table with status `PENDING`/`PROCESSING`/`DONE`) in one DB transaction, so a persisted message can never exist without its task and a failed send can be retried safely.
- **Completion is atomic**: the dispatcher claims the task (`PENDING → PROCESSING` via a conditional update — safe in prod cluster mode) and commits the `BOT` reply together with the `DONE` status in one transaction, so a message gets at most one reply.
- **Recovery**: on startup and every 30 seconds `BotPluginsService` sweeps for work left unfinished by a restart: tasks stuck in `PROCESSING` older than 60 s are reopened, then every `PENDING` task is dispatched through the regular path (the reply goes to the DB and the SSE stream). A message sent right before a restart gets its reply shortly after the app is back — no user action needed.
- **Frontend**: when the chat SSE stream reconnects, the chat reloads the history, so replies delivered while the client was disconnected appear without a page reload.

A plugin error closes the task without a reply (isolation contract — a permanently failing plugin is not retried); only infrastructure failures (e.g. a failed reply transaction) are retried by the sweep.

## Inline Keyboard Buttons

Bot replies can carry a small inline keyboard — a horizontal strip of tappable buttons rendered under the message bubble. The operator composes the keyboard in the mock-bot console; the user taps a button in `/chat`; the press is captured server-side for the operator but never echoed back into the user's own chat.

### Message snapshot

Each `Message` row stores its keyboard as a `Json` column (`buttons`) alongside the text (`content`) and a `kind` flag:

```prisma
enum MessageKind { TEXT  BUTTON }

model Message {
  kind    MessageKind @default(TEXT)
  content String
  buttons Json?
}
```

`buttons` is a **snapshot**, not a live reference to a preset — deleting or editing a preset does not rewrite the buttons on messages that were already sent. `Message.buttons` is serialised as `KeyboardButtonDto[]` (`{ title, callbackData }`) or `null` when the message has no keyboard.

Validation lives in `backend/src/utils/keyboard-buttons.ts` (`validateButtons`, `toButtons`, `MAX_BUTTONS = 12`, `MAX_TITLE_LENGTH = 64`, `MAX_CALLBACK_LENGTH = 256`). The same limits are enforced in the DTOs via `class-validator` (`maxLength`) and by `MockBotService.replyAsBot`, `ButtonPresetsService`, and `ChatService.submitButtonCallback`.

### Operator reply

`POST /api/v1/mock-bot/conversations/:userId/messages` accepts `{ content?, buttons? }` and is valid as long as **at least one** of them is non-empty after trimming — a buttons-only reply with empty text is allowed (`content` is persisted as `''`). The reply is stored with `kind: TEXT` and the validated `buttons` array; the resulting `ChatEvent` is published to the bus with the same `buttons` payload so the user's SSE stream and the operator's console stream render the keyboard without a refetch.

`GET /api/v1/mock-bot/conversations/:userId/messages` always returns every message — TEXT and BUTTON — because the operator needs to see which buttons the user pressed. `GET /api/v1/chat/messages` and `GET /api/v1/chat/stream` do the opposite for the user: `ChatService` filters out `kind: BUTTON` in `getHistory`, and `streamEvents` drops BUTTON events before mapping them to `ChatStreamEventDto` — this is the "no echo" rule.

### Button press (no echo, opt-in plugins)

`POST /api/v1/chat/button-callbacks` with `{ callbackData }` upserts the conversation and writes a `Message { senderRole: USER, kind: BUTTON, content: <callbackData> }` **together with its `BotPluginTask` in one transaction** — the same crash-safe acceptance path as a typed message — then publishes a `ChatEvent` with `kind: BUTTON` and runs the plugin dispatcher with `kind: 'BUTTON'`. A dispatch error is caught and logged, so the click itself always returns `201`.

Only plugins that declare `handlesCallbacks = true` are offered a button payload, so `ping` written into a button's `callbackData` still _does not_ trigger the PingPong reply — the payload never reaches a plugin without the opt-in. `SettingsPlugin` is the opted-in example: `settings:language:ru` switches the stored language and answers with a confirmation, `settings:language:de` answers with a refusal and changes nothing.

Whatever the plugin decides travels the same way as any other reply, never inside the click response: the dispatcher persists a `BOT` message in the transaction that closes the `BotPluginTask` and publishes it to the bus, so the client picks it up over SSE (and the recovery sweep replays it if the process died in between). That is why the click endpoint cannot report a plugin error — a plugin exception is logged and closes the task without a message, while an intentional refusal is a reply.

The response is the persisted callback message DTO; the frontend chat calls `sendButtonCallback` and discards the result (a plugin confirmation arrives as an ordinary `BOT` message over SSE), so the user's bubble list never grows from a click. The operator's `/mock-bot` stream does receive the event and shows the pressed `callbackData` as a USER message.

### Button presets

`ButtonPreset` (`backend/prisma/schema.prisma`) names a reusable keyboard for the operator: `{ id, name, buttons Json, ownerId → User (onDelete: Cascade) }`, table `button_presets`. CRUD lives in `ButtonPresetsService`/`ButtonPresetsController` (`/api/v1/mock-bot/presets`) behind `ApiKeyGuard` + `AdminGuard`. Every read/write is scoped by `ownerId` — `update`/`remove` use conditional `updateMany`/`deleteMany` with `{ id, ownerId }` and raise `NotFoundException` when the count is 0, so a foreign preset id is indistinguishable from a missing one. Presets never touch messages: they are only a source for the composer's draft keyboard.

To exercise owner isolation in tests, register a second account via `POST /api/v1/auth/register` (the response carries both `user` and its `apiKey`), then promote it with `PATCH /api/v1/admin/users/:id { "role": "ADMIN" }` — do not mint an additional key through `ApiKeyService.createForUser` for the mock caller, otherwise both "admins" resolve to the same owner row.

## Telegram Bots

Real Telegram Bot API integration via [grammY](https://grammy.dev). Each bot is owned by an ADMIN, stores its token (masked in responses), and optionally registers a webhook for receiving updates.

### Endpoints (requires ADMIN role)

- `GET /api/v1/telegram/bots` — List the calling admin's bots (tokens masked)
- `POST /api/v1/telegram/bots` — Create a bot (body: `{ name, botToken, botUsername?, settings?, isActive? }`, 201)
- `GET /api/v1/telegram/bots/:id` — Read a single caller-owned bot (foreign/missing → 404)
- `PATCH /api/v1/telegram/bots/:id` — Update bot fields (partial body; foreign/missing → 404)
- `DELETE /api/v1/telegram/bots/:id` — Delete a caller-owned bot (204; webhook best-effort unregistered)

### Key behaviours

- **Owner-scope**: every read/write is scoped by `ownerId`; a foreign bot id is indistinguishable from a missing one (404).
- **Token masking**: `botToken` is stored verbatim but only returned as `first6…last4`; the per-bot `webhookSecret` is never surfaced in DTOs.
- **Settings**: arbitrary JSON object (`settings: { ... }`) stored/returned as-is; `null` clears it.
- **isActive toggle**: handled through the regular `PATCH` endpoint.
- **Webhook lifecycle** (`TelegramWebhookService`): on app start, best-effort `setWebhook` for all active bots; on create/update/enable → set, on disable → delete, on delete → unregister. Errors are logged, never thrown. When `TELEGRAM_WEBHOOK_BASE_URL` is empty, registration is skipped with a warning.
- **Environment**: `TELEGRAM_WEBHOOK_BASE_URL` (public HTTPS origin; e.g. `https://your-domain.com` → webhook URL becomes `https://your-domain.com/api/telegram/webhook/<botId>`).

### Target assignment & deep-link binding

Each user has a **transport target**: either a Telegram bot (identified by `telegramBotId` on the User row) or the mock-server (`telegramBotId = null`). An admin assigns or resets the target:

- `PUT /api/v1/admin/users/:id/telegram-target` — body `{ telegramBotId: string | null }` (requires ADMIN). Assigning a foreign or nonexistent bot → `404`. Target changes never clear `telegramChatId`: an existing chat binding is preserved and can only be rebound to a different chat id via the `/start <token>` deep-link flow.

Once a user's target is a bot, the user obtains a one-time **deep-link** to start the Telegram conversation:

- `POST /api/v1/telegram/launch` — (requires authenticated user with a bot target). Returns `{ url, token }` where `url` is `https://t.me/<botUsername>?start=<token>`. Returns `400` when target is mock-server or the bot has no `botUsername`.

The **transport gate** (`ChatService.assertTransportActive`): when the user's target bot exists and `isActive === false`, `POST /api/v1/chat/messages` and `POST /api/v1/chat/button-callbacks` return `409 Conflict` before persisting anything. Active bots and mock-server targets pass through normally (201).

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

### E2E conventions

E2E specs (`backend/test/*.e2e-spec.ts`) run against a live backend on
`:3000`, use the OpenAPI SDK generated under `backend/test/generated/client`,
and prepare fixtures **only** through HTTP endpoints (no direct Prisma
access). Full rules are captured in the project skill
[`.agents/skills/e2e-fixture-hygiene/SKILL.md`](../.agents/skills/e2e-fixture-hygiene/SKILL.md).

The single most important rule: **the seeded admin (`admin@kaufman.bot`) is
a real operator account, not a test fixture.** Test cleanup must never
enumerate or delete rows owned by the seeded key. Every operator-side CRUD
(button presets, chat messages, API keys, etc.) runs behind a **test-spawned
ADMIN** obtained via `POST /auth/register` + `PATCH /admin/users/:id`
`{ role: 'ADMIN' }`. The seeded admin key is used only for
`registerAccount`, `removeAccountAsAdmin(id)` on test-created ids, and
role-promotion — nothing else.

Pre-commit self-check:

```bash
# From backend/
grep -RnE 'admin\.sdk\.[a-zA-Z]+(Remove|Delete|Update|Create)V1' test/*.e2e-spec.ts
```

Legitimate hits: `adminUsersControllerUpdateV1` (promote in `spawnAdmin`) and
`adminUsersControllerRemoveV1` (either the self-delete negative test or a
remove whose id was returned by an earlier `admin.registerAccount(...)` in
the same spec). Anything else is a bug.

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observer](https://observer.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
