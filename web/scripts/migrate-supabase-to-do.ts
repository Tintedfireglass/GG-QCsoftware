import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

const DO_URL = "postgres://doadmin:AVNS_9X8idNUg1lRt0kPR_VK@pramaan-gg-db-do-user-35374582-0.k.db.ondigitalocean.com:25060/defaultdb";
const pool = new Pool({ connectionString: DO_URL, ssl: { rejectUnauthorized: false } });
const exportDir = path.join(__dirname, '..', 'db_export');

// All tables in FK-safe order
const ALL_TABLES = [
    'users', 'machines', 'machine_groups', 'pramaan_scoring_versions',
    'license_keys', 'qc_results', 'test_results',
    'license_key_activations', 'license_key_audits', 'machine_history',
    'machine_lifecycle_events', 'customer_users', 'customer_orders',
    'free_trials', 'trial_email_blocks'
];

function pgType(col: any): string {
    switch (col.data_type) {
        case 'character varying': return 'VARCHAR';
        case 'timestamp without time zone': return 'TIMESTAMP';
        case 'timestamp with time zone': return 'TIMESTAMPTZ';
        case 'integer': return 'INTEGER';
        case 'bigint': return 'BIGINT';
        case 'boolean': return 'BOOLEAN';
        case 'text': return 'TEXT';
        case 'jsonb': return 'JSONB';
        case 'uuid': return 'UUID';
        case 'numeric': return 'NUMERIC';
        default: return col.data_type.toUpperCase();
    }
}

async function createAllTables() {
    console.log('Creating tables...');
    for (const name of ALL_TABLES) {
        const schemaFile = path.join(exportDir, `${name}_schema.json`);
        if (!fs.existsSync(schemaFile)) { console.log(`  Skipping ${name} (no schema file)`); continue; }

        const schema = JSON.parse(fs.readFileSync(schemaFile, 'utf-8'));
        const cols = schema.map((col: any) => {
            if (col.column_name === 'id') return 'id SERIAL PRIMARY KEY';
            let def = `${col.column_name} ${pgType(col)}`;
            if (col.is_nullable === 'NO') def += ' NOT NULL';
            if (col.column_default && !col.column_default.includes('nextval')) {
                if (col.column_default === 'now()') def += ' DEFAULT NOW()';
                else if (col.column_default === 'true') def += ' DEFAULT TRUE';
                else if (col.column_default === 'false') def += ' DEFAULT FALSE';
                else if (col.column_default.includes('::')) def += ` DEFAULT ${col.column_default.split('::')[0]}`;
                else def += ` DEFAULT ${col.column_default}`;
            }
            return def;
        });

        try {
            await pool.query(`CREATE TABLE IF NOT EXISTS ${name} (\n  ${cols.join(',\n  ')}\n)`);
            console.log(`  ✓ ${name}`);
        } catch (err: any) {
            console.log(`  ✗ ${name}: ${err.message.split('\n')[0]}`);
        }
    }
}

async function importTable(name: string) {
    const file = path.join(exportDir, `${name}.sql`);
    if (!fs.existsSync(file)) { console.log(`  Skipping (no data file)`); return; }

    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(l => l.trim().startsWith('INSERT INTO'));
    if (lines.length === 0) { console.log(`  ✓ No data`); return; }

    // Use ON CONFLICT DO NOTHING and batch into multi-row inserts for speed
    // Each line is: INSERT INTO t (cols) VALUES (vals);
    // We'll send them in batches of 200 using individual queries with ON CONFLICT DO NOTHING
    const BATCH = 200;
    let imported = 0, failed = 0;

    for (let i = 0; i < lines.length; i += BATCH) {
        const batch = lines.slice(i, i + BATCH)
            .map(l => l.replace(/;$/, ' ON CONFLICT DO NOTHING'));
        try {
            await pool.query(batch.join(';\n'));
            imported += batch.length;
        } catch {
            // Fallback: run individually
            for (const line of batch) {
                try {
                    await pool.query(line);
                    imported++;
                } catch (err: any) {
                    if (!err.message.includes('duplicate') && !err.message.includes('already exists')) {
                        failed++;
                        if (failed <= 3) console.log(`  ! ${err.message.substring(0, 100)}`);
                    }
                }
            }
        }
    }
    console.log(`  ✓ ${imported} imported, ${failed} failed`);
}

async function main() {
    console.log('Connecting...');
    await pool.query('SELECT 1');
    console.log('Connected to DigitalOcean\n');

    await createAllTables();

    console.log('\nImporting data...');
    for (const table of ALL_TABLES) {
        process.stdout.write(`${table}... `);
        await importTable(table);
    }

    await pool.end();
    console.log('\n✅ Done!');
}

main().catch(err => { console.error(err.message); process.exit(1); });
