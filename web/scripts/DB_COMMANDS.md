# Quick Reference: Database Commands

## NPM Scripts (Recommended)

```bash
# Generate migration after editing drizzle/schema.ts
npm run db:generate

# Apply migrations to database
npm run db:push

# Open database browser UI
npm run db:studio
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
