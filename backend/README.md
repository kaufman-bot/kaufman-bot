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

- `POST /api/v1/auth/login` — Login with API key, returns user profile
- `GET /api/v1/auth/me` — Profile behind the presented API key
- `PATCH /api/v1/auth/me` — Self-service profile update (body: `{ timezone?: string | null }`, an IANA time zone; `null` clears it)

#### User Chat (requires USER or ADMIN role)

- `GET /api/v1/chat/messages` — Get message history for the authenticated user's conversation
- `POST /api/v1/chat/messages` — Send a message to the bot (body: `{ content: string }`)
- `GET /api/v1/chat/stream` — SSE stream for real-time messages (use `?apiKey=` query param)

#### Mock Bot Console (requires ADMIN role)

- `GET /api/v1/mock-bot/conversations` — List all user conversations with unread counts
- `GET /api/v1/mock-bot/conversations/:userId/messages` — Get messages for a specific user's conversation
- `POST /api/v1/mock-bot/conversations/:userId/messages` — Reply as bot (body: `{ content: string }`)
- `GET /api/v1/mock-bot/stream` — SSE stream for all conversation events (use `?apiKey=` query param)

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

- implements the single `BotPlugin` interface from `bot-plugin.interface.ts` — `name`, `canHandle(content)` (exact, trimmed, case-insensitive matching is up to the plugin) and `handle({ user, content })` returning the reply text;
- is registered in `AppModule` as its own provider and added to the `inject` list of the single `BOT_PLUGINS` factory — Nest does not merge several providers of one token into an array, so the token is aggregated once via `useFactory`; the `inject` order is the dispatch priority.

When a user sends a chat message, `ChatService` hands it to the plugin dispatcher (`BotPluginsService`): the first plugin whose `canHandle` matches produces the reply, which is persisted as a `BOT` message and delivered over the chat SSE stream like any other bot reply. A plugin failure never fails the user's own message; plugin order in `AppModule` is the dispatch priority.

Built-in plugins:

- **PingPongPlugin** — replies `pong` to a `ping` message;
- **TimePlugin** — replies with the current server time formatted in the user's IANA time zone (falls back to UTC when unset), e.g. `2026-11-01 12:34:56 (Europe/Moscow)`.

The user time zone is stored on the `User` row (`timezone`, nullable). The frontend syncs the browser time zone automatically after login/session restore via `PATCH /api/v1/auth/me`; the value can also be updated manually with the same endpoint.

To add a new plugin: create a class implementing `BotPlugin` in `backend/src/plugins/`, register it as a plain provider in `AppModule` and add it to the `inject` list of the `BOT_PLUGINS` factory (order = priority), and cover its behavior with unit tests next to the file.

### Reliable delivery across restarts

Plugin dispatch is crash-safe — the server may be restarted at any moment (dev watch, deploys, worker crashes) without losing messages or interrupting processing:

- **Acceptance is atomic**: `ChatService.sendMessage` creates the user message and its dispatch task (`BotPluginTask`, outbox table with status `PENDING`/`PROCESSING`/`DONE`) in one DB transaction, so a persisted message can never exist without its task and a failed send can be retried safely.
- **Completion is atomic**: the dispatcher claims the task (`PENDING → PROCESSING` via a conditional update — safe in prod cluster mode) and commits the `BOT` reply together with the `DONE` status in one transaction, so a message gets at most one reply.
- **Recovery**: on startup and every 30 seconds `BotPluginsService` sweeps for work left unfinished by a restart: tasks stuck in `PROCESSING` older than 60 s are reopened, then every `PENDING` task is dispatched through the regular path (the reply goes to the DB and the SSE stream). A message sent right before a restart gets its reply shortly after the app is back — no user action needed.
- **Frontend**: when the chat SSE stream reconnects, the chat reloads the history, so replies delivered while the client was disconnected appear without a page reload.

A plugin error closes the task without a reply (isolation contract — a permanently failing plugin is not retried); only infrastructure failures (e.g. a failed reply transaction) are retried by the sweep.

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
