// Database Export Script from Supabase
// Run with: npx tsx scripts/export-supabase.ts

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

// Supabase connection details - use non-pooling port
const connectionString = "postgres://postgres.sizfngtkvhcdjncfjuoe:YfaAkBQX0fk3Gi0k@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require";

// Remove sslmode from query params to avoid conflicts with explicit ssl config
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
    ssl: { rejectUnauthorized: false }, // Same as db.ts
});

async function exportTable(tableName: string, outputPath: string) {
    console.log(`Exporting ${tableName}...`);
    
    const result = await pool.query(`SELECT * FROM ${tableName}`);
    
    if (result.rows.length === 0) {
        console.log(`  -> No data in ${tableName}`);
        return;
    }
    
    // Generate INSERT statements
    const inserts: string[] = [];
    
    for (const row of result.rows) {
        const columns = Object.keys(row);
        const values = columns.map(col => {
            const val = row[col];
            if (val === null) return 'NULL';
            if (typeof val === 'number') return val;
            if (typeof val === 'boolean') return val;
            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            return `'${String(val).replace(/'/g, "''")}'`;
        });
        
        inserts.push(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`);
    }
    
    const content = `-- Export from ${tableName} at ${new Date().toISOString()}\n-- Row count: ${result.rows.length}\n\n${inserts.join('\n')}`;
    
    fs.writeFileSync(outputPath, content);
    console.log(`  -> Exported ${result.rows.length} rows to ${outputPath}`);
}

async function getTableSchema(tableName: string): Promise<string> {
    const result = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
    `, [tableName]);
    
    return result.rows;
}

async function main() {
    const exportDir = path.join(__dirname, '..', 'db_export');
    
    if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
    }
    
    console.log('Starting database export from Supabase...\n');
    
    // Tables to export
    const tables = ['machines', 'qc_results', 'test_results', 'users'];
    
    for (const table of tables) {
        await exportTable(table, path.join(exportDir, `${table}.sql`));
    }
    
    // Also export schema
    console.log('\nExporting table schemas...');
    for (const table of tables) {
        const schema = await getTableSchema(table);
        const schemaPath = path.join(exportDir, `${table}_schema.json`);
        fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
    }
    
    await pool.end();
    
    console.log('\n✅ Export complete!');
    console.log(`Files saved to: ${exportDir}`);
    console.log('\nNext steps:');
    console.log('1. Set up your new PostgreSQL database');
    console.log('2. Run web/lib/init-db.sql to create tables');
    console.log('3. Import the exported SQL files into your new database');
    console.log('4. Update .env.local with new database credentials');
}

main().catch(console.error);