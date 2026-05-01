// Migrate from exported Supabase data to DigitalOcean
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

const DO_URL = "postgres://doadmin:AVNS_9X8idNUg1lRt0kPR_VK@pramaan-gg-db-do-user-35374582-0.k.db.ondigitalocean.com:25060/defaultdb?sslmode=require";

const pool = new Pool({
    connectionString: DO_URL.replace('?sslmode=require', ''),
    ssl: { rejectUnauthorized: false }
});

async function main() {
    console.log('Connecting to DigitalOcean...');
    await pool.query('SELECT 1');
    console.log('Connected!\n');

    console.log('Importing data from exported files...');
    const exportDir = path.join(__dirname, '..', 'db_export');
    
    const tables = ['machines', 'users', 'qc_results', 'test_results'];
    
    for (const table of tables) {
        console.log(`\nImporting ${table}...`);
        const filePath = path.join(exportDir, `${table}.sql`);
        const sql = fs.readFileSync(filePath, 'utf-8');
        
        const lines = sql.split('\n').filter(l => l.startsWith('INSERT INTO'));
        let imported = 0;
        
        for (const line of lines) {
            try {
                await pool.query(line);
                imported++;
            } catch (err: any) {
                if (!err.message.includes('duplicate') && !err.message.includes('already exists')) {
                    console.log(`  Warning: ${err.message.substring(0, 100)}`);
                }
            }
        }
        
        console.log(`  ✓ Imported ${imported} rows`);
    }

    await pool.end();
    console.log('\n✅ Migration complete!');
}

main().catch(console.error);
