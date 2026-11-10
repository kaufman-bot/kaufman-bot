# Agent Memory Policy — Project Knowledge Lives in the Repo

## Rule

**All project-specific knowledge MUST live in this repository.** Agent
memory (Qoder memories, Cursor rules, Claude project context, etc.) is a
machine-local cache and is _not_ the source of truth. Anything an agent
would need to work correctly on this codebase must be discoverable by
cloning the repo — no personal memory, no IDE profile, no per-machine
scratchpad.

If you (an agent) are about to save a project-scoped fact into your own
memory, stop: write the same fact into one of the project files listed
below and do not create the memory entry at all.

## Where each kind of knowledge goes

| Kind                                                                                                          | Project location                                                                                     | Format                                                              |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Hard rule every contributor must follow (schema, DTO/Swagger, task granularity, migrations, e2e hygiene, ...) | `.agents/skills/<slug>/SKILL.md`                                                                     | Markdown rule with "Rule / Why / Workflow / Forbidden / Self-check" |
| Constraint that must be visible inside an OpenSpec workflow (proposal / tasks / apply / archive)              | `openspec/config.yaml` → `context:` and `rules:`                                                     | YAML blocks                                                         |
| Behavioural spec of a capability (what the code promises to do)                                               | `openspec/specs/<capability>/spec.md`                                                                | Requirement + Scenario                                              |
| Cross-cutting architectural decisions (why a component is shaped this way)                                    | `docs/decisions.md`                                                                                  | ADR-lite entries: date, context, decision, consequences             |
| Project architecture, module layout, tech stack, build/run topology                                           | `docs/architecture.md`, `README.md`, `backend/README.md`, `frontend/README.md`                       | Prose + tables                                                      |
| Runtime environment: ports, env vars, PM2, Docker, proxy, seed users                                          | `docs/environment.md`, `backend/.env.example`, `docker-compose.yml`, `ecosystem*.config.cjs`, README | Table of variables + example values                                 |
| IDE tooling defaults (extensions, launch config, tasks)                                                       | `.vscode/*` (checked in), mentioned in README                                                        | Native VS Code JSON                                                 |
| Recurring pitfalls and gotchas (tool or framework bugs hit in this repo)                                      | `docs/pitfalls.md`                                                                                   | Bullet per pitfall: symptom, root cause, fix, boundary              |
| Deferred work, small cleanups, backlog items with anchors into code                                           | `BACKLOG.md`                                                                                         | Item with `#NNN` anchor and file/line pointer                       |
| Historical task summaries                                                                                     | git log + PR descriptions; NOT memory                                                                | `git log`, `CHANGELOG`                                              |
| Personal user preferences (name, timezone, response language, tone)                                           | **stay in agent memory** — they belong to the human, not to the code                                 | —                                                                   |

## What stays in agent memory (personal, not project-scoped)

- `user_info`, `user_communication`, `user_behavior`, `user_prefer` — the
  human operator's identity, tone, and preferences.
- Personal shortcuts and cross-project tool experience that would not be
  meaningful without this repo (e.g. "the user's laptop uses Nix").

Anything with the word "project" in its meaning — architecture, tech
stack, env variables, build configuration, dependencies, testing rules,
SCM layout, IDE conventions, pitfalls, decisions — belongs in the repo
and must be moved out of memory the moment it is discovered.

## Workflow for agents

1. **Before saving a new memory**, ask: _"would a fresh clone of this
   repo on a new machine, worked on by a different developer or a
   different agent, need this fact?"_ If yes → write it into one of the
   project files above and skip the memory.
2. **If a fact is already in a project file**, do not duplicate it in
   memory. Point at the file instead.
3. **If you find a memory-only project fact during a task**, either
   migrate it in the same session (create or extend the project file,
   then delete the memory) or file a `BACKLOG.md` item labelled
   `memory-migration` so it is not lost.
4. **Never store secrets in project files** — API keys, DB passwords,
   tokens go to `.env` (which is gitignored), not into README or docs.
5. **Never store transient state** — running PIDs, current git branch,
   session-specific debug output stay outside the repo entirely.

## Migration checklist (for a one-time sweep)

- [ ] Enumerate every project-scoped memory entry.
- [ ] Assign each to one of the target files above.
- [ ] Write / merge the content into that file.
- [ ] Delete the memory entry.
- [ ] Add cross-links so the new file is discoverable from README and
      from `openspec/config.yaml` `context:` if the fact gates an
      OpenSpec workflow.
- [ ] Verify: clone to a fresh path, run the tests / commands the
      migrated knowledge describes, and confirm the repo alone is
      sufficient.

## Self-check

```bash
# Every project-scoped rule should have a home; grep for orphan knowledge.
ls .agents/skills/
grep -n "context:" openspec/config.yaml
ls docs/ 2>/dev/null
```

If a rule is _only_ findable in some agent's memory, that is a bug: file
it under `BACKLOG.md` with `memory-migration` tag and place it in the
right file in the next session.

## Current knowledge surfaces in this project

Anything an agent needs to work on this repo is discoverable from these
files — no personal memory required:

| Surface                                                                                              | Contents                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md` (root)                                                                                   | Project overview, tech stack, architecture diagram, folder layout, quickstart, dev/prod run & stop, API endpoints, DB / MinIO / Prisma / VS Code / MCP / NPM scripts / testing / CI-CD / formatting / security / troubleshooting / contributing; contains the "Документация проекта" section indexing `docs/` |
| `docs/README.md`                                                                                     | Index / map of `docs/*`; how to use and how to add new knowledge                                                                                                                                                                                                                                              |
| `docs/architecture.md`                                                                               | NestJS topology, URL/versioning, ServeStatic prod, plugin + transactional outbox, guards, Angular layout, SDK contract                                                                                                                                                                                        |
| `docs/environment.md`                                                                                | Ports, env vars inventory, Docker images, PM2 configs, Prisma CLI, MCP levels, `opwork` submodule, npm scripts, first-machine checklist                                                                                                                                                                       |
| `docs/testing.md`                                                                                    | Backend unit/e2e, frontend unit/e2e, OpenAPI SDK regeneration workflow, Playwright baseURL/dev vs. prod, seed-admin hygiene, CI JUnit reports                                                                                                                                                                 |
| `docs/pitfalls.md`                                                                                   | Reproduced bugs with symptom / root cause / fix / boundary: Nest multi-provider, supertest ESM, ActivityHelper stateful, GitHub Actions gitlink/cleanup, ServeStatic `/swagger` exact, hey-api SDK edge cases, Prisma camelCase, MinIO root user, PM2 npm-wrapper                                             |
| `docs/decisions.md`                                                                                  | ADR-lite: rationale, alternatives and expiry conditions for `.env-file`, GitHub MCP Docker, HTTP-only e2e, one AppModule, service-layer split, transactional outbox, Playwright single worker, SDK in VCS, URI versioning, seed defaults, MinIO Bitnami, opwork submodule, memory-in-repo                     |
| `BACKLOG.md`                                                                                         | Numbered deferred-work items with anchors ("see BACKLOG.md #N") in code and docs                                                                                                                                                                                                                              |
| `backend/README.md`                                                                                  | NestJS-specific docs: web-chat, bot plugins, inline keyboard buttons, reliable delivery, run/test commands                                                                                                                                                                                                    |
| `frontend/README.md`                                                                                 | Angular-specific notes                                                                                                                                                                                                                                                                                        |
| `docker-compose.yml`, `ecosystem.config.cjs`, `ecosystem-prod.config.cjs`, `start-*.sh`, `stop-*.sh` | Environment topology: ports, images, volumes, PM2 processes                                                                                                                                                                                                                                                   |
| `backend/.env.example`                                                                               | Env-variable inventory with safe defaults (secrets live only in `backend/.env`, which is gitignored)                                                                                                                                                                                                          |
| `openspec/config.yaml`                                                                               | `schema`, `context:` (project-wide constraints surfaced to OpenSpec agents) and `rules:` (per-artifact: tasks granularity, etc.)                                                                                                                                                                              |
| `openspec/specs/<capability>/spec.md`                                                                | Behavioural spec of every shipped capability (what the code promises)                                                                                                                                                                                                                                         |
| `openspec/changes/<change>/`                                                                         | Live proposals, designs, deltas and task lists for in-flight changes                                                                                                                                                                                                                                          |
| `.agents/skills/prisma-migrations-only/`                                                             | Rule: schema changes go through Prisma migrations only                                                                                                                                                                                                                                                        |
| `.agents/skills/controller-dto-swagger/`                                                             | Rule: controller handlers use DTO classes with Swagger decorators                                                                                                                                                                                                                                             |
| `.agents/skills/service-layer-split/`                                                                | Rule: entity-CRUD services vs. use-case services, `AppModule` providers registration                                                                                                                                                                                                                          |
| `.agents/skills/backend-module-topology/`                                                            | Rule: exactly one AppModule; tech-debt items go to `BACKLOG.md` with code anchors                                                                                                                                                                                                                             |
| `.agents/skills/e2e-fixture-hygiene/`                                                                | Rule: e2e tests never mutate seeded-admin data; test-spawned admins for CRUD                                                                                                                                                                                                                                  |
| `.agents/skills/agent-memory-policy/`                                                                | This file — where project knowledge lives, and what may stay in agent memory                                                                                                                                                                                                                                  |
| `.agents/skills/git-onboarding-commit/`                                                              | Rule: how to structure onboarding / review-friendly commit series                                                                                                                                                                                                                                             |
| `.agents/skills/readme-auto-update/`                                                                 | Rule: README syncs with structural / config / behaviour changes                                                                                                                                                                                                                                               |
| `.agents/skills/openspec-*`                                                                          | OpenSpec workflow skills (propose / apply / archive / sync / explore / update)                                                                                                                                                                                                                                |
| `.vscode/*` (extensions, settings, launch, tasks)                                                    | IDE defaults; keep in repo, mention in README                                                                                                                                                                                                                                                                 |
| `.github/workflows/ci.yml`, `e2e-prod.yml`                                                           | CI contract: what every push and every prod-e2e run does                                                                                                                                                                                                                                                      |

If a piece of agent memory is not covered by one of the rows above,
either add it to the closest surface or add a new skill file next to the
existing ones and list it here.
