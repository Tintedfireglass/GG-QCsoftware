// Apply one hand-written migration from drizzle/manual/ to the default database,
// or to Cirtyn (US) with --cirtyn.
//
// The manual migrations are additive and idempotent (CREATE ... IF NOT EXISTS),
// so this is the safe alternative to `drizzle-kit push`, which diffs the whole
// schema and can emit destructive statements. The whole file runs in a single
// transaction: either every statement lands or none does.
//
//   node scripts/apply-manual-migration.mjs 0029_partner_api_keys.sql
//   node scripts/apply-manual-migration.mjs 0029_partner_api_keys.sql --cirtyn

import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';
import pg from 'pg';

const args = process.argv.slice(2);
const cirtyn = args.includes('--cirtyn');
const file = args.find((a) => !a.startsWith('--'));

// Same split as drizzle.config.cirtyn.ts: each database keeps its credentials in
// its own env file, so there is no way to point one at the other by accident.
const target = cirtyn
    ? { label: 'Cirtyn (US)', envFile: '.env.cirtyn', vars: ['CIRTYN_DATABASE_URL'] }
    : { label: 'default', envFile: '.env.local', vars: ['DATABASE_URL', 'POSTGRES_URL'] };

config({ path: target.envFile });

if (!file) {
    console.error('Usage: node scripts/apply-manual-migration.mjs <file.sql> [--cirtyn]');
    process.exit(1);
}

const connectionString = target.vars.map((v) => process.env[v]).find(Boolean);
if (!connectionString) {
    console.error(`❌ ${target.vars.join(' (or ')}${target.vars.length > 1 ? ')' : ''} is not set in ${target.envFile}`);
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
    console.log(`Applying ${path} to the ${target.label} database …`);
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
