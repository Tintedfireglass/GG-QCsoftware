import { Pool } from 'pg';

// Helper to clean connection string of sslmode and ensure we control SSL
const getConnectionString = () => {
    let connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

    // Remove sslmode from query params if present to avoid conflicts with our explicit ssl config
    if (connectionString) {
        try {
            const url = new URL(connectionString);
            url.searchParams.delete('sslmode');
            connectionString = url.toString();
        } catch (e) {
            // If it's not a valid URL (e.g. localhost), just leave it
            console.warn('Could not parse connection string URL', e);
        }
    }
    return connectionString;
};

// Create a PostgreSQL connection pool
// This works with any PostgreSQL database (Vercel Postgres, Supabase, Railway, Neon, etc.)
const pool = new Pool({
    connectionString: getConnectionString(),
    ssl: { rejectUnauthorized: false }, // Explicitly allow self-signed certs
});

export default pool;

// Helper function to execute queries
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    if (process.env.NODE_ENV === 'development') {
        console.log('Executed query', { text, duration, rows: res.rowCount });
    }

    return res.rows as T[];
}

// Helper to get a single row
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    const rows = await query<T>(text, params);
    return rows.length > 0 ? rows[0] : null;
}
