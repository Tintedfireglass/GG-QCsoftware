// Database Migration Script to Digital Ocean
// Run with: npx tsx scripts/migrate-to-do.ts

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

// Digital Ocean PostgreSQL connection details
const connectionString = "postgres://doadmin:AVNS_9X8idNUg1lRt0kPR_VK@pramaan-gg-db-do-user-35374582-0.k.db.ondigitalocean.com:25060/defaultdb?sslmode=require";

// Clean connection string (remove sslmode to avoid conflicts)
const cleanConnectionString = (() => {
    try {
        const url = new URL(connectionString);
        url.searchParams.delete('sslmode');
        return url.toString();
    } catch {
        return connectionString;
    }
})();

const pool = new Pool({
    connectionString: cleanConnectionString,
    ssl: { rejectUnauthorized: false }
});

async function createTables() {
    console.log('Creating base schema...');
    const schema = fs.readFileSync(path.join(__dirname, '..', 'lib', 'init-db.sql'), 'utf-8');
    try {
        await pool.query(schema);
    } catch (err: any) {
        console.log('  Schema creation note:', err.message.split('\n')[0]);
    }
    
    console.log('Running migrations...');
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        try {
            await pool.query(sql);
        } catch (err: any) {
            if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
                console.log(`  [${file}] Note:`, err.message.split('\n')[0]);
            }
        }
        console.log(`  Applied: ${file}`);
    }
    
    console.log('  Schema ready');
}

async function importTable(tableName: string, filePath: string) {
    console.log(`Importing ${tableName}...`);
    
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Extract INSERT statements
    const insertStatements = content.match(/INSERT INTO .+?;/g) || [];
    
    let imported = 0;
    for (const stmt of insertStatements) {
        try {
            await pool.query(stmt);
            imported++;
        } catch (err: any) {
            if (!err.message.includes('duplicate') && !err.message.includes('already exists')) {
                console.log(`  Warning: ${err.message}`);
            }
        }
    }
    
    console.log(`  -> Imported ${imported} rows`);
}

async function main() {
    console.log('Starting migration to Digital Ocean...\n');
    
    // Test connection
    try {
        await pool.query('SELECT 1');
        console.log('Connected to Digital Ocean database\n');
    } catch (err) {
        console.error('Failed to connect to Digital Ocean:', err);
        process.exit(1);
    }
    
    // Create tables
    await createTables();
    console.log('');
    
    // Import data
    const exportDir = path.join(__dirname, '..', 'db_export');
    
    await importTable('machines', path.join(exportDir, 'machines.sql'));
    await importTable('qc_results', path.join(exportDir, 'qc_results.sql'));
    await importTable('test_results', path.join(exportDir, 'test_results.sql'));
    await importTable('users', path.join(exportDir, 'users.sql'));
    
    await pool.end();
    
    console.log('\n✅ Migration complete!');
    console.log('\nNext steps:');
    console.log('1. Update .env.local with Digital Ocean credentials');
    console.log('2. Test the application');
}

main().catch(console.error);