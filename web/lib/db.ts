import { Pool } from 'pg';

// Create a PostgreSQL connection pool
// This works with any PostgreSQL database (Vercel Postgres, Supabase, Railway, Neon, etc.)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
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
