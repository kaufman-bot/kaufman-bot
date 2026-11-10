# Документация проекта

Этот каталог — ** machine-agnostic источник проектной памяти **: всё, что нужно
знать, чтобы работать с репозиторием с нуля на свежем клоне, живёт здесь или в
файлах, на которые указывают ссылки ниже. Никакая знаниевая единица не должна
оставаться в личной памяти разработчика или агента — полный разбор правила
в [.agents/skills/agent-memory-policy/SKILL.md](../.agents/skills/agent-memory-policy/SKILL.md).

## Карта

| Файл                                               | Что внутри                                                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [architecture.md](architecture.md)                 | Топология Nest-модуля, URL/версионирование, плагинная система бота с транзакционным outbox, ServeStatic в prod          |
| [environment.md](environment.md)                   | Порты, Docker, PM2, `.env` и seed-переменные, Prisma CLI, уровни MCP, gitlink `opwork/`                                 |
| [testing.md](testing.md)                           | Backend-e2e через OpenAPI SDK, Playwright-консоль фронта, конвенции fixture-hygiene, схема перегенерации SDK            |
| [pitfalls.md](pitfalls.md)                         | Баги и подводные камни, на которые уже наступали (Nest multi-provider, supertest ESM, GitHub Actions gitlink, MCP read) |
| [decisions.md](decisions.md)                       | ADR-lite: контекст / решение / последствия по ключевым развилкам проекта                                                |
| [../BACKLOG.md](../BACKLOG.md)                     | Отложенный долг с якорями в коде («now / do / when»)                                                                    |
| [../openspec/specs/](../openspec/specs/)           | Поведенческие спецификации выпущенных возможностей                                                                      |
| [../openspec/changes/](../openspec/changes/)       | Активные и архивные изменения (proposal / design / tasks / delta)                                                       |
| [../.agents/skills/](../.agents/skills/)           | Жёсткие правила для агента (migrations-only, DTO/Swagger, e2e hygiene, memory policy, topology, service split и т.д.)   |
| [../openspec/config.yaml](../openspec/config.yaml) | `context:` и `rules:`, видимые OpenSpec-воркфлоу                                                                        |
| [../README.md](../README.md)                       | Обзор, быстрый старт, API, CI/CD, безопасность, участие                                                                 |
| [../backend/README.md](../backend/README.md)       | NestJS-специфика: web-chat, кнопки, доставка ответов, run/test                                                          |
| [../frontend/README.md](../frontend/README.md)     | Angular-специфика                                                                                                       |

## Как пользоваться

1. **Первый заход** — начните с [../README.md](../README.md) («Быстрый старт»),
   затем [environment.md](environment.md) и [architecture.md](architecture.md).
2. **PIQA / отладка** — проверьте [pitfalls.md](pitfalls.md): почти наверняка
   этот баг уже разбирался.
3. **Дизайн нового изменения** — откройте [decisions.md](decisions.md) и
   соответствующий skill в `.agents/skills/`; изменения должны согласовываться
   с принятыми развилками, а не переизобретать их.
4. **Тесты и CI** — [testing.md](testing.md) описывает, как запускать наборы и
   какие контракты нужно держать в силе.

## Как добавлять

Правило переноса: **память агента ≠ источник истины**. Если в процессе работы
всплывает факт, полезный для следующего разработчика, — он должен попасть в
один из файлов выше. Формат:

| Тип факта                                                       | Куда                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| Навсегда жёсткое правило (запрет / обязательная форма)          | Новый `.agents/skills/<slug>/SKILL.md` + упоминание в README-таблице |
| Архитектурная развилка с обоснованием                           | Секция в [decisions.md](decisions.md) (ADR-lite)                     |
| Факт про запуск / env / инфраструктуру                          | [environment.md](environment.md) или конкретный конфиг               |
| Воспроизведённый баг с root cause                               | [pitfalls.md](pitfalls.md)                                           |
| Поведение системы, которое надо зафиксировать перед реализацией | `openspec/changes/<name>/specs/...` + потом `openspec/specs/...`     |
| Отложенная работа                                               | [../BACKLOG.md](../BACKLOG.md) с якорем                              |

После записи — удалите локальную память-дубликат, если она была создана.
