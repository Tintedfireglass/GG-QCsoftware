const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

function getConnectionString() {
    let connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
    if (connectionString) {
        try {
            const url = new URL(connectionString);
            url.searchParams.delete('sslmode');
            connectionString = url.toString();
        } catch (e) {
            console.warn('Could not parse connection string URL', e);
        }
    }
    return connectionString;
}

async function runMigration() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; 
    
    const pool = new Pool({
        connectionString: getConnectionString(),
        ssl: { rejectUnauthorized: false },
    });

    const sql = fs.readFileSync(path.join(__dirname, '../migrations/025_user_perpetual_key_permission.sql'), 'utf-8');
    
    try {
        console.log('Running migration...');
        await pool.query(sql);
        console.log('Migration successful!');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await pool.end();
    }
}

runMigration();
