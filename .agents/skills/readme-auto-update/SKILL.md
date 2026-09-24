# README Auto-Update Skill

## Rule

**Automatically update README.md when relevant project files are created, modified, or deleted.**

This skill ensures that README.md stays in sync with the actual project structure, configuration, and features.

## When to Update README

Update README.md when you modify any of the following:

### 1. Project Structure Changes

- **Add/remove/rename directories** in `backend/`, `frontend/`, or root
- **Move files** between modules
- **Change file organization** in `src/`

### 2. Configuration Changes

- **package.json** (root, backend, frontend) — new scripts, dependencies
- **docker-compose.yml** — new services, volumes, ports
- **ecosystem.config.cjs** / **ecosystem-prod.config.cjs** — PM2 processes
- **.env.example** — new environment variables
- **proxy.conf.json** — API proxy changes
- **angular.json** — build/serve configuration
- **tsconfig.json** — TypeScript configuration

### 3. Backend Changes

- **backend/src/main.ts** — global prefix, versioning, CORS, port
- **backend/src/api-version.ts** — API version constant
- **backend/src/controllers/** — new endpoints, route changes
- **backend/prisma/schema.prisma** — new models, fields, relations
- **backend/package.json** — new scripts, dependencies

### 4. Frontend Changes

- **frontend/src/app/dashboard.service.ts** — API endpoints, new services
- **frontend/src/app/app.component.ts** — UI changes
- **frontend/package.json** — new scripts, dependencies

### 5. Infrastructure Changes

- **start-dev.sh** / **stop-dev.sh** — dev startup flow
- **start-prod.sh** / **stop-prod.sh** — prod startup flow
- **.husky/pre-commit** — hook behavior
- **.vscode/extensions.json** — recommended extensions

### 6. MCP Integration

- **Add/remove MCP servers** in project configuration
- **Change MCP capabilities** or usage patterns

## What to Update

### Project Description

- Update business logic description if models/features change
- Update technology stack if dependencies change

### Quick Start

- Update requirements if Node.js version changes
- Update installation commands if scripts change

### Start/Stop Instructions

- Update startup flow if shell scripts change
- Update ports if configuration changes
- Update PM2 processes if ecosystem configs change

### Project Structure

- Update directory tree if files/folders are added/removed/moved
- Keep the tree accurate and concise

### API Endpoints

- Add new endpoints to the table
- Update endpoint descriptions if behavior changes
- Update examples if request/response format changes

### Database

- Update connection parameters if docker-compose.yml changes
- Update Prisma commands if scripts change
- Update model descriptions if schema changes

### VS Code Extensions

- Add/remove extensions if .vscode/extensions.json changes
- Update descriptions if extension purpose changes

### MCP Servers

- Add/remove MCP servers if configuration changes
- Update capabilities if MCP tools change
- Update usage examples if integration changes

### NPM Scripts

- Add/remove scripts if package.json changes
- Update descriptions if script behavior changes
- Keep tables accurate for root, backend, and frontend

### Troubleshooting

- Add new common issues and solutions
- Remove outdated problems
- Update solutions if fixes change

## How to Update

### 1. Identify the Section

Determine which section(s) of README.md need updating based on the file changes.

### 2. Read Current README

```bash
cat README.md
```

### 3. Make Targeted Edits

Use SearchReplace to update only the affected sections. Do NOT rewrite the entire README.

**Example: Adding a new API endpoint**

```
Find the "API Endpoints" table and add a new row:
| GET | `/api/v1/new-endpoint` | Description of new endpoint |
```

**Example: Adding a new npm script**

```
Find the "NPM Scripts" table and add:
| `npm run new-script` | Description of new script |
```

**Example: Updating project structure**

```
Find the "Структура проекта" section and update the directory tree to reflect changes.
```

### 4. Verify Accuracy

After updating, verify that:

- All commands are correct and runnable
- All paths are accurate
- All descriptions match current behavior
- No outdated information remains

### 5. Keep it Concise

- Use tables for structured data (endpoints, scripts, extensions)
- Use code blocks for commands and examples
- Keep descriptions clear and brief
- Write in Russian (project language requirement)

## Language Requirement

**All README content must be in Russian.** This includes:

- Section headers
- Descriptions
- Comments in examples
- Troubleshooting guides

Code blocks, commands, and technical terms can remain in English.

## Examples

### Example 1: Adding a New Controller

**You added:** `backend/src/controllers/users.controller.ts` with endpoints:

- GET /api/v1/users
- POST /api/v1/users
- GET /api/v1/users/:id

**Update README:**

1. Add endpoints to "API Endpoints" table
2. Update business logic description if needed
3. Add usage examples

### Example 2: Adding a New NPM Script

**You added:** `npm run seed` to root package.json

**Update README:**

1. Add to "Корневые скрипты" table:
   ```
   | `npm run seed` | Заполнение базы данных начальными данными |
   ```

### Example 3: Changing Database Schema

**You added:** New model `Product` to Prisma schema

**Update README:**

1. Update "Модель данных" section
2. Add Product description
3. Update database statistics if mentioned

### Example 4: Adding VS Code Extension

**You added:** `ms-vscode.vscode-typescript-next` to .vscode/extensions.json

**Update README:**

1. Add to "VS Code расширения" section:
   ```
   - **ms-vscode.vscode-typescript-next** — TypeScript next version support
   ```
2. Update installation command

### Example 5: Adding MCP Server

**You added:** New MCP server `redis` for cache management

**Update README:**

1. Add to "Доступные MCP-серверы" section:

   ```
   #### 8. **redis** — Управление кэшем Redis
   Работа с Redis для кэширования данных.

   **Возможности:**
   - Чтение/запись ключей
   - Очистка кэша
   - Мониторинг
   ```

2. Add usage example

## Forbidden Actions

| Action                         | Why not                       |
| ------------------------------ | ----------------------------- |
| Rewrite entire README          | Loses existing content, risky |
| Delete sections without reason | Information loss              |
| Add English descriptions       | Project requires Russian      |
| Leave outdated information     | Misleads users                |
| Skip verification              | May introduce errors          |

## Checklist

Before completing README update, verify:

- [ ] All modified sections are accurate
- [ ] Commands are correct and runnable
- [ ] Paths and file names are correct
- [ ] Descriptions match current behavior
- [ ] Language is Russian (except code/commands)
- [ ] Tables are properly formatted
- [ ] Code blocks have correct syntax highlighting
- [ ] No broken links or references
- [ ] Section headers are consistent
- [ ] Information is concise and clear

## File Locations

| File                                         | Purpose                              |
| -------------------------------------------- | ------------------------------------ |
| `README.md`                                  | Main project documentation (Russian) |
| `.agents/skills/readme-auto-update/SKILL.md` | This skill file                      |

## Notes

- Update README **immediately** after making changes, not later
- If unsure whether to update, **do update** — better to have current info
- Keep README as the **single source of truth** for project documentation
- If a change is minor (typo fix, internal refactor), README update may not be needed
- For major changes, consider adding a note in "Решение проблем" if applicable
