# Backend Module Topology — One AppModule + BACKLOG.md for Debt

## Rule

The backend has **exactly one** Nest module — `AppModule`
(`backend/src/app.module.ts`). Everything else lives either as:

- a **plain provider** (services under `backend/src/services/`, plus
  infrastructure services like `PrismaService`, `SeedService`), or
- a **third-party module** imported in `AppModule.imports` (e.g.
  `ServeStaticModule.forRoot(...)`, `ObserveModule.forRoot(...)`).

Wrapper Nest modules (`PrismaModule`, `SeedModule`) exist today only as
legacy shims and are marked **slated for removal** in the source. New
infrastructure classes go **directly** into `AppModule.providers`
without a wrapping `@Module`.

Technical debt — anything that ships today but should be revisited —
is recorded in `BACKLOG.md` at the repo root, as a numbered item with
an anchor comment in the affected file or design doc.

## Why

- NestJS DI resolves class-token providers inside a single module
  without any `exports` ceremony; splitting services into feature
  modules adds import graphs and no benefit at this project size.
- A flat `AppModule` makes the wiring diff one screen; adding a service
  or controller is a one-line change and code review sees it clearly.
- Third-party modules (Prisma driver, Observe, ServeStatic) are the
  only reason any `imports[]` entry exists; those are external API
  surfaces, not our architecture.
- `BACKLOG.md` is the single place a future reader looks to see what
  is intentionally unfinished — instead of scattered `TODO:` comments
  or tribal memory.

## Canonical `AppModule`

```ts
// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ObserveModule } from '@nestjs/observe';
import { join } from 'path';

import { PrismaService } from './prisma/prisma.service';
import { SeedService } from './seed/seed.service';
import { AuthService } from './services/auth.service';
import { UsersService } from './services/users.service';
import { ApiKeysService } from './services/api-keys.service';
import { ChatService } from './services/chat.service';
import { ChatEventsService } from './services/chat-events.service';
import { MockBotService } from './services/mock-bot.service';
import { ButtonPresetsService } from './services/button-presets.service';
import { BotPluginsService } from './services/bot-plugins.service';
import { BOT_PLUGINS } from './interfaces/bot-plugin.interface';
import { PingPongPlugin } from './plugins/ping-pong.plugin';
import { TimePlugin } from './plugins/time.plugin';
// controllers ...

@Module({
  imports: [ConfigModule.forRoot(), ObserveModule.forRoot(), ...(process.env.NODE_ENV === 'production' ? [ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', 'client', 'browser') })] : [])],
  controllers: [TimeController, HealthController, AuthController, ApiKeysController, AdminUsersController, ChatController, MockBotController, ButtonPresetsController],
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
    PingPongPlugin,
    TimePlugin,
    {
      provide: BOT_PLUGINS,
      useFactory: (...plugins: BotPlugin[]) => plugins,
      inject: [PingPongPlugin, TimePlugin], // order == dispatch priority
    },
  ],
})
export class AppModule {}
```

Notes:

- `PrismaService` is registered here directly. `PrismaModule` is kept
  as a thin wrapper only until callers are migrated; new code must not
  import it. Same for `SeedModule` / `SeedService`.
- Nest **does not** merge multiple `useClass` providers of the same
  token into an array — that is why `BOT_PLUGINS` is aggregated with
  `useFactory` + explicit `inject` list. Order in `inject` is dispatch
  priority.

## Forbidden

| Anti-pattern                                                                  | Why                                                                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Adding a new `@Module` in `backend/src/<feature>/`                            | Fragments DI; every feature would then need to import the ones it uses. Keep services in `providers[]` |
| Re-exporting a service from a wrapper `@Module` just to `import` it elsewhere | Same DI graph, extra file. Register once in `AppModule.providers`                                      |
| Introducing a `SharedModule`, `CoreModule`, etc.                              | The project is not big enough to need them                                                             |
| Adding a plugin without appending it to `BOT_PLUGINS.inject`                  | Nest will register the class provider but never feed it to the dispatcher                              |
| Inline `// TODO: remove PrismaModule` without a `BACKLOG.md` entry            | Tribal memory; `BACKLOG.md` is the single source                                                       |

## Recording debt in `BACKLOG.md`

Format for every entry:

```markdown
3. **PrismaModule/SeedModule wrappers** — _now:_ kept as thin shims so
   older imports continue to work; _do:_ drop both files and reference
   `PrismaService` / `SeedService` directly from `AppModule.providers`;
   _when:_ after the last caller in `src/` and `test/` stops importing
   them. Anchor: `// see BACKLOG.md #3` in `src/prisma/prisma.module.ts`.
```

Three fields are mandatory: **now / do / when** (current shape, target
shape, unblocking condition). Add the anchor comment inside the affected
code or in the design doc that mentions the plan.

Existing backlog items in this repo:

| #   | Topic                                                                                        | Anchor                                                            |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1–2 | Redis-backed chat-event bus + task queue (unlocks cluster-mode SSE without polling)          | `BotPluginsService.sweep()` interval, `ChatEventsService` Subject |
| 3   | Drop `PrismaModule` / `SeedModule` wrappers                                                  | `src/prisma/prisma.module.ts`, `src/seed/seed.module.ts`          |
| 4   | Anything discovered during the current change that is intentionally not done in this session | Add a new numbered item following the template                    |

Items 1–2 are gated on Redis being introduced; items 3–4 are not.

## Adding a new feature — module checklist

- [ ] Write the service in `backend/src/services/<flow>.service.ts`
      following `service-layer-split`.
- [ ] Register it as a **provider** in `AppModule.providers`.
- [ ] If it exposes HTTP routes, add a controller and register it in
      `AppModule.controllers`.
- [ ] If it plugs into the bot dispatcher, add the plugin class as a
      provider **and** extend `BOT_PLUGINS.useFactory.inject` in the
      order you want it to be tried.
- [ ] Do **not** create a `<Flow>Module`. Do **not** import a wrapper
      module in `AppModule.imports` for this feature.
- [ ] If you knowingly leave a compromise, add a `BACKLOG.md` entry
      with an inline anchor.

## Self-check

```bash
# Exactly one @Module class outside of third-party imports.
grep -RnE '@Module\(' backend/src | grep -v node_modules
```

Expected hits:

- `backend/src/app.module.ts` — the only `@Module` in `src/`
  (excluding any wrapper `*.module.ts` files still on the removal
  list).

Any new `@Module` outside `app.module.ts` needs to be justified in the
PR and — if it is a legitimate wrapper for a third-party integration —
documented in `README.md`. Otherwise it is a bug: convert it to plain
providers.

## Related files

| File                                             | Role                                                 |
| ------------------------------------------------ | ---------------------------------------------------- |
| `backend/src/app.module.ts`                      | Sole application module (controllers + providers)    |
| `backend/src/prisma/prisma.module.ts`            | Legacy wrapper, `slated for removal`, see BACKLOG #3 |
| `backend/src/seed/seed.module.ts`                | Legacy wrapper, `slated for removal`, see BACKLOG #3 |
| `backend/src/interfaces/bot-plugin.interface.ts` | `BOT_PLUGINS` DI token                               |
| `backend/src/services/bot-plugins.service.ts`    | `useFactory` aggregation + dispatcher + sweep        |
| `BACKLOG.md`                                     | Numbered debt items with "now / do / when" + anchors |
| `.agents/skills/service-layer-split/SKILL.md`    | Companion rule: which service a method belongs in    |
