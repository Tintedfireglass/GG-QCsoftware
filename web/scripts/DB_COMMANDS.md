# Quick Reference: Database Commands

## Targets

| Target | Config | Credentials | Scripts |
| --- | --- | --- | --- |
| Default (India / Pramaan) | `drizzle.config.ts` | `.env.local` → `DATABASE_URL` | `db:push`, `db:studio` |
| Cirtyn (US) | `drizzle.config.cirtyn.ts` | `.env.cirtyn` → `CIRTYN_DATABASE_URL` | `db:push-cirtyn`, `db:studio-cirtyn` |

The Cirtyn credentials are only wired into drizzle-kit — the app's runtime DB
connection is untouched, so nothing but schema pushes talks to that database.

## NPM Scripts (Recommended)

```bash
# Generate migration after editing drizzle/schema.ts
npm run db:generate

# Apply migrations to database
npm run db:push

# Apply ONE hand-written migration from drizzle/manual/ (additive, transactional).
# Safer than db:push when you only want the new table/columns.
npm run db:apply -- 0029_partner_api_keys.sql

# Open database browser UI
npm run db:studio
```

## Cirtyn (US) Database

```bash
# Push the current drizzle/schema.ts to the Cirtyn DB
npm run db:push-cirtyn

# Seed a fresh DB: SuperAdmin user + general/branding settings (idempotent)
npm run db:seed-cirtyn
npm run db:seed-cirtyn -- --username admin --email you@cirtyn.com --password 'Secret123!'

# Browse the Cirtyn DB
npm run db:studio-cirtyn

# Direct equivalent
npx drizzle-kit push --config drizzle.config.cirtyn.ts

# Backup (uses CIRTYN_DATABASE_URL from .env.cirtyn)
pg_dump "$CIRTYN_DATABASE_URL" > cirtyn-backup.sql
```

## Direct Commands

```bash
# Generate migration
npx drizzle-kit generate

# Push schema to DB
npx drizzle-kit push

# Open Drizzle Studio
npx drizzle-kit studio

# Pull schema from DB
npx drizzle-kit introspect
```

## Backup Database

```bash
# Windows
.\scripts\export-db.ps1

# Manual
pg_dump $DATABASE_URL > backup.sql
```

## Complete Workflow Example

```bash
# 1. Edit schema
# Edit drizzle/schema.ts

# 2. Generate migration
npm run db:generate

# 3. Review generated SQL
# Check drizzle/0001_*.sql

# 4. Apply to database
npm run db:push

# 5. Verify in browser
npm run db:studio
```
