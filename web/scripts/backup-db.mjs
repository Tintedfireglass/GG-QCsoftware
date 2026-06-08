// Full data backup of the configured Postgres DB to timestamped JSON files.
// Uses the app's existing `pg` driver — no pg_dump / client tools required.
// Discovers every table in the `public` schema dynamically (no schema drift).
//
//   npm run db:backup
//
// NOTE: this is a DATA snapshot (rows as JSON), not a DDL/pg_dump backup.
// It is restorable by re-inserting rows, but does not capture schema/constraints.

import { config } from 'dotenv';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

config({ path: '.env.local' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
    console.error('❌ DATABASE_URL (or POSTGRES_URL) is not set in .env.local');
    process.exit(1);
}

const maskUrl = (u) => u.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const backupDir = path.join(__dirname, '..', 'db_backup', timestamp);
fs.mkdirSync(backupDir, { recursive: true });

// Drop sslmode from the URL so it doesn't force verify-full; we set ssl explicitly
// (DigitalOcean managed PG presents a self-signed chain).
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

async function main() {
    console.log(`Backing up: ${maskUrl(connectionString)}\n`);
    const client = await pool.connect();
    try {
        const { rows: tables } = await client.query(
            `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
        );
        if (tables.length === 0) {
            console.error('❌ No tables found in public schema.');
            process.exit(1);
        }

        const manifest = [];
        let totalRows = 0;
        for (const { tablename } of tables) {
            const { rows } = await client.query(`SELECT * FROM "${tablename}"`);
            fs.writeFileSync(path.join(backupDir, `${tablename}.json`), JSON.stringify(rows, null, 2));
            manifest.push({ table: tablename, rows: rows.length });
            totalRows += rows.length;
            console.log(`  ✓ ${tablename}: ${rows.length} rows`);
        }

        fs.writeFileSync(
            path.join(backupDir, '_manifest.json'),
            JSON.stringify(
                { takenAt: new Date().toISOString(), database: maskUrl(connectionString), totalRows, tables: manifest },
                null,
                2
            )
        );

        console.log(`\n✅ Backup complete — ${tables.length} tables, ${totalRows} rows`);
        console.log(`📁 ${backupDir}`);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error('❌ Backup failed:', err);
    process.exit(1);
});
