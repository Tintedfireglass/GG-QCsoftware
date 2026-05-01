import { Pool, PoolClient } from 'pg';

// Helper to clean connection string of sslmode and ensure we control SSL
const getConnectionString = () => {
    let connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

    // Vercel allows env var "references" like ${SOME_VAR}. DigitalOcean does not resolve these.
    // Fail fast with a clear error instead of passing an invalid URL to the pg client.
    if (connectionString && /\$\{[^}]+\}/.test(connectionString)) {
        throw new Error(
            `DATABASE_URL looks like an unresolved placeholder: "${connectionString}". ` +
            `Set DATABASE_URL (or POSTGRES_URL) to a real Postgres connection string in your DigitalOcean environment.`
        );
    }

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

// Helper to wrap queries in a transaction
export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}
