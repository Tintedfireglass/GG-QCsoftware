// Apply one hand-written migration from drizzle/manual/ to the default database.
//
// The manual migrations are additive and idempotent (CREATE ... IF NOT EXISTS),
// so this is the safe alternative to `drizzle-kit push`, which diffs the whole
// schema and can emit destructive statements. The whole file runs in a single
// transaction: either every statement lands or none does.
//
//   node scripts/apply-manual-migration.mjs 0029_partner_api_keys.sql

import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: '.env.local' });

const file = process.argv[2];
if (!file) {
    console.error('Usage: node scripts/apply-manual-migration.mjs <file.sql>');
    process.exit(1);
}

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
    console.error('❌ DATABASE_URL (or POSTGRES_URL) is not set in .env.local');
    process.exit(1);
}

const cleanUrl = (() => {
    try {
        const u = new URL(connectionString);
        u.searchParams.delete('sslmode');
        return u.toString();
    } catch {
        return connectionString;
    }
})();

const path = join('drizzle', 'manual', file);
const sql = readFileSync(path, 'utf8');
const pool = new pg.Pool({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });

const client = await pool.connect();
try {
    console.log(`Applying ${path} …`);
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Applied.');
} catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Rolled back:', err.message);
    process.exitCode = 1;
} finally {
    client.release();
    await pool.end();
}
