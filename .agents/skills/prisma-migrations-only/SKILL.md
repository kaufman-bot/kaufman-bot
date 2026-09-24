# Prisma Migrations Only — Database Change Policy

## Rule

**All database schema changes MUST be done exclusively through Prisma migrations.**
Never run raw SQL against the database, never edit tables directly, never use `prisma db push`.

## Why

- Migrations are version-controlled, reproducible, and reviewable in PRs.
- Every environment (dev, staging, prod) applies the same migration history.
- `prisma db push` bypasses the migration system and can cause drift between schema and actual DB state.

## Workflow

### 1. Edit the schema

Change `backend/prisma/schema.prisma` — add models, fields, relations, enums, etc.

### 2. Create a migration

```bash
# From project root:
npm run prisma:create -- <migration_name>

# Or from backend/:
npx prisma migrate dev --name <migration_name>
```

This generates a SQL migration file in `backend/prisma/migrations/` and applies it.

### 3. Apply migrations (deploy / other machines)

```bash
# From project root:
npm run prisma:migrate

# Or from backend/:
npx prisma migrate deploy
```

### 4. Regenerate Prisma Client

After migrations that change the schema:

```bash
# From project root:
npm run generate

# Or from backend/:
npx prisma generate
```

### 5. Seed data (if needed)

Seeds are NestJS services using `OnApplicationBootstrap` in `backend/src/seed/`.
Default admin and other bootstrap data are seeded automatically on app start.

## Forbidden

| Action | Why not |
|---|---|
| `prisma db push` | Bypasses migration history, causes schema drift |
| Raw `ALTER TABLE` / `CREATE TABLE` via psql | Untracked, unreproducible |
| Manual SQL files outside Prisma migrations | No integration with Prisma Client |
| Editing migration files after creation | Breaks migration history checksum |

## File Locations

| File | Purpose |
|---|---|
| `backend/prisma/schema.prisma` | Single source of truth for DB schema |
| `backend/prisma/migrations/` | Migration history (auto-generated) |
| `backend/prisma.config.ts` | Prisma config (loads DATABASE_URL from .env) |
| `backend/src/seed/` | NestJS seed services (bootstrap data) |
| `backend/src/generated/prisma/` | Generated Prisma Client (do not edit) |
