import { Pool } from 'pg';

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

// The pg Pool is the single connection source for the app; lib/drizzle.ts wraps
// it. All data access goes through Drizzle (db / db.execute / db.transaction).
export default pool;
