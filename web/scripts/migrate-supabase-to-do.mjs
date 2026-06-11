// migrate-supabase-to-do.mjs
//
// Full data migration: Supabase (source) → DigitalOcean (target).
//
// What it does:
//   1. Opens two simultaneous pg connections (source + target).
//   2. Truncates ALL public-schema tables on DO (CASCADE, RESTART IDENTITY).
//   3. Copies every row from Supabase → DO in FK-safe insertion order,
//      using batched parameterized INSERTs (500 rows/batch).
//   4. Resyncs all serial sequences on DO so new rows won't hit PK conflicts.
//   5. Prints a per-table row-count comparison summary at the end.
//
// Usage:
//   npm run db:migrate-to-do
//
// Prerequisites:
//   • .env.local  → Supabase DATABASE_URL  (source)
//   • .env.do     → DO_DATABASE_URL        (target, must already have schema)

import { config } from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });
config({ path: path.join(__dirname, '..', '.env.do') });

// ── Helpers ──────────────────────────────────────────────────────────────────

const maskUrl = (u) => u.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@');

function makePool(url, label) {
    if (!url) {
        console.error(`❌ Missing connection string for ${label}`);
        process.exit(1);
    }
    // Strip sslmode from query string; we handle it via the ssl option.
    let clean = url;
    try {
        const u = new URL(url);
        u.searchParams.delete('sslmode');
        clean = u.toString();
    } catch { /* keep original */ }

    console.log(`  ${label}: ${maskUrl(url)}`);
    return new pg.Pool({ connectionString: clean, ssl: { rejectUnauthorized: false } });
}

// Splits an array into chunks of at most `size`.
function chunks(arr, size) {
    const result = [];
    for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
    return result;
}

// Build a parameterized INSERT for a batch of rows.
// jsonbColumns: Set of column names that hold jsonb/json — these must be
// explicitly serialized to string so pg doesn't re-encode them as literals.
function buildInsert(tableName, columns, rows, jsonbColumns) {
    const placeholders = rows.map((row, ri) =>
        `(${columns.map((_, ci) => `$${ri * columns.length + ci + 1}`).join(', ')})`
    ).join(',\n  ');
    const values = rows.flatMap(row =>
        columns.map(col => {
            const v = row[col];
            // If the column is jsonb/json AND the value is a non-null object/array,
            // stringify it — otherwise pg will serialize it incorrectly.
            if (jsonbColumns.has(col) && v !== null && typeof v === 'object') {
                return JSON.stringify(v);
            }
            return v;
        })
    );
    return {
        text: `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES\n  ${placeholders}`,
        values,
    };
}

// ── Table insertion order (FK-safe) ─────────────────────────────────────────
// Tables with no FK dependencies come first; dependents come after their parents.
// Any table NOT listed here will be appended at the end automatically.

const FK_ORDER = [
    'users',
    'machines',
    'machine_groups',
    'pramaan_scoring_versions',
    'plans',
    'customer_users',
    'otp_codes',
    'mobile_devices',
    'coupons',
    'license_keys',
    'license_key_activations',
    'license_key_audits',
    'customer_orders',
    'coupon_redemptions',
    'qc_results',
    'test_results',
    'machine_history',
    'machine_lifecycle_events',
    'free_trials',
    'trial_email_blocks',
    'mobile_reports',
    'mobile_stress_samples',
    'visitor_sessions',
    'analytics_events',
    'contact_submissions',
    'support_tickets',
    'payment_gateways',
    'payment_webhook_events',
    'email_providers',
    'sms_providers',
    'email_templates',
    'app_settings',
    'app_releases',
];

function sortTables(discovered) {
    const known = FK_ORDER.filter(t => discovered.includes(t));
    const unknown = discovered.filter(t => !FK_ORDER.includes(t));
    return [...known, ...unknown];
}

// ── Sequence repair (mirrors fix-sequences.mjs) ──────────────────────────────

const FIND_SEQUENCES = `
    SELECT c.table_name, c.column_name,
           pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) AS seq
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_default LIKE 'nextval(%'
    ORDER BY c.table_name`;

async function fixSequences(client) {
    console.log('\n🔧 Resyncing sequences…');
    const { rows } = await client.query(FIND_SEQUENCES);
    let fixed = 0;
    for (const r of rows) {
        if (!r.seq) continue;
        const q = `SELECT setval($1,
            COALESCE((SELECT MAX("${r.column_name}") FROM "${r.table_name}"), 1),
            (SELECT COUNT(*) FROM "${r.table_name}") > 0) AS newval`;
        const { rows: res } = await client.query(q, [r.seq]);
        console.log(`  ✓ ${r.table_name}.${r.column_name} → next id after ${res[0].newval}`);
        fixed++;
    }
    console.log(`  Resynced ${fixed} sequence(s).`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;

async function main() {
    const srcUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    const dstUrl = process.env.DO_DATABASE_URL;

    console.log('\n📦 Supabase → DigitalOcean migration');
    console.log('─'.repeat(60));
    const srcPool = makePool(srcUrl, '  SOURCE (Supabase)');
    const dstPool = makePool(dstUrl, '  TARGET (DigitalOcean)');
    console.log('─'.repeat(60));

    const srcClient = await srcPool.connect();
    const dstClient = await dstPool.connect();

    const summary = []; // { table, srcRows, dstRows, status }

    try {
        // 1. Discover all public tables from source.
        // Discover tables on SOURCE (Supabase)
        const { rows: srcTableRows } = await srcClient.query(
            `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
        );
        const srcTables = srcTableRows.map(r => r.tablename);
        if (srcTables.length === 0) {
            console.error('❌ No tables found in Supabase public schema.');
            process.exit(1);
        }

        // Discover tables on TARGET (DigitalOcean) — only migrate tables that exist on BOTH.
        const { rows: dstTableRows } = await dstClient.query(
            `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
        );
        const dstTablesSet = new Set(dstTableRows.map(r => r.tablename));

        // Tables in Supabase but not in DO (legacy / unmigrated schema)
        const skippedTables = srcTables.filter(t => !dstTablesSet.has(t));
        if (skippedTables.length > 0) {
            console.log(`⚠️  Skipping ${skippedTables.length} table(s) not in DO schema: ${skippedTables.join(', ')}\n`);
        }

        // Only work with tables that exist on both sides
        const commonTables = srcTables.filter(t => dstTablesSet.has(t));
        const orderedTables = sortTables(commonTables);
        console.log(`\n📋 Migrating ${orderedTables.length} tables (${skippedTables.length} skipped).\n`);

        // 2. Truncate all DO tables (only the ones we'll populate) using CASCADE.
        console.log('🗑️  Truncating all DigitalOcean tables…');
        // Use DO's full table list for truncation so we clear everything cleanly
        const allDoTables = dstTableRows.map(r => r.tablename);
        const truncateList = allDoTables.map(t => `"${t}"`).join(', ');
        await dstClient.query(`TRUNCATE ${truncateList} RESTART IDENTITY CASCADE`);
        console.log('   ✓ All tables truncated.\n');

        // 3. Copy data table by table.
        console.log('📤 Copying data…\n');
        for (const tableName of orderedTables) {
            process.stdout.write(`  ${tableName}… `);

            // Read all rows from source.
            const { rows: srcRows } = await srcClient.query(`SELECT * FROM "${tableName}"`);

            if (srcRows.length === 0) {
                summary.push({ table: tableName, srcRows: 0, dstRows: 0, status: '⚪ empty' });
                process.stdout.write(`0 rows — skipped\n`);
                continue;
            }

            const columns = Object.keys(srcRows[0]);

            // Detect which columns are jsonb/json so we can serialize them correctly.
            const { rows: colTypes } = await srcClient.query(
                `SELECT column_name FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = $1
                   AND data_type IN ('json', 'jsonb')`,
                [tableName]
            );
            const jsonbColumns = new Set(colTypes.map(r => r.column_name));

            // Insert in batches.
            let inserted = 0;
            for (const batch of chunks(srcRows, BATCH_SIZE)) {
                const { text, values } = buildInsert(tableName, columns, batch, jsonbColumns);
                await dstClient.query(text, values);
                inserted += batch.length;
            }

            // Verify row count on target.
            const { rows: [{ count }] } = await dstClient.query(
                `SELECT COUNT(*) AS count FROM "${tableName}"`
            );
            const dstCount = parseInt(count, 10);
            const ok = dstCount === srcRows.length;
            summary.push({
                table: tableName,
                srcRows: srcRows.length,
                dstRows: dstCount,
                status: ok ? '✅ OK' : '⚠️  MISMATCH',
            });
            process.stdout.write(`${srcRows.length} rows → ${dstCount} rows ${ok ? '✅' : '⚠️'}\n`);
        }

        // 4. Fix sequences.
        await fixSequences(dstClient);

    } finally {
        srcClient.release();
        dstClient.release();
        await srcPool.end();
        await dstPool.end();
    }

    // 5. Print summary table.
    console.log('\n' + '═'.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('═'.repeat(60));
    const colW = Math.max(...summary.map(r => r.table.length), 5);
    console.log(
        `${'Table'.padEnd(colW)}  ${'Source'.padStart(8)}  ${'Target'.padStart(8)}  Status`
    );
    console.log('-'.repeat(colW + 30));
    let anyMismatch = false;
    for (const r of summary) {
        console.log(
            `${r.table.padEnd(colW)}  ${String(r.srcRows).padStart(8)}  ${String(r.dstRows).padStart(8)}  ${r.status}`
        );
        if (r.status.includes('MISMATCH')) anyMismatch = true;
    }
    console.log('─'.repeat(colW + 30));
    const total = summary.reduce((s, r) => s + r.srcRows, 0);
    console.log(`${'TOTAL'.padEnd(colW)}  ${String(total).padStart(8)}`);
    console.log('═'.repeat(60));

    if (anyMismatch) {
        console.error('\n⚠️  Some tables have row count mismatches — please investigate.');
        process.exit(1);
    } else {
        console.log('\n✅ Migration complete! All row counts match.');
        console.log('   Next: update DATABASE_URL in .env.local to the DO connection string,');
        console.log('   then run `npm run dev` to verify the app works on the new database.\n');
    }
}

main().catch((err) => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
});
