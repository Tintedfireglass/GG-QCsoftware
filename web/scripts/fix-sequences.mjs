// Resync all serial/identity sequences in the public schema to MAX(id).
// Fixes "duplicate key value violates unique constraint ..._pkey" errors that
// occur after data is imported with explicit IDs (e.g. a DB migration/restore).
//
//   npm run db:fix-sequences

import { config } from 'dotenv';
import pg from 'pg';

config({ path: '.env.local' });

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

const pool = new pg.Pool({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });

// Every column whose default is a nextval(...) sequence.
const FIND_SEQUENCES = `
    SELECT c.table_name, c.column_name,
           pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) AS seq
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_default LIKE 'nextval(%'
    ORDER BY c.table_name`;

async function main() {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(FIND_SEQUENCES);
        let fixed = 0;
        for (const r of rows) {
            if (!r.seq) continue;
            // is_called = true when rows exist → next value is MAX+1; else seq starts at 1.
            const q = `SELECT setval($1,
                COALESCE((SELECT MAX("${r.column_name}") FROM "${r.table_name}"), 1),
                (SELECT COUNT(*) FROM "${r.table_name}") > 0) AS newval`;
            const { rows: res } = await client.query(q, [r.seq]);
            console.log(`  ✓ ${r.table_name}.${r.column_name} → next id after ${res[0].newval}`);
            fixed++;
        }
        console.log(`\n✅ Resynced ${fixed} sequence(s).`);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error('❌ Failed:', err);
    process.exit(1);
});
