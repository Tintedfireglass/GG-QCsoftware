import { Pool, types } from 'pg';

// --- Timezone contract -------------------------------------------------------
// Several core columns (qc_results.timestamp, qc_results.created_at,
// machines.last_seen, ...) are `timestamp without time zone` and hold UTC
// wall-clock, because the DB session runs with TimeZone = GMT and rows are
// written with NOW().
//
// By default node-postgres parses those naive strings using the *Node process*
// timezone, so the same row decodes to a different instant on a UTC server than
// on an IST laptop — a silent 5:30 shift in everything the dashboard renders.
// Pin the parser to UTC so decoding is identical everywhere; display is then
// converted to APP_TIME_ZONE by the formatters in lib/utils.ts.
//
// IMPORTANT: this parser is a safety net for raw `pool.query` only — it does NOT
// run for app queries. Drizzle (the only consumer of this pool today) overrides
// pg's timestamp/timestamptz/date parsers with identity functions per query, so
// those columns come back as raw strings. Normalising them to UTC is therefore
// the job of parseDbTimestamp() in lib/timezone.ts — use it for every DB
// timestamp instead of `new Date(value)`.
const PG_TIMESTAMP_OID = 1114;        // timestamp without time zone
types.setTypeParser(PG_TIMESTAMP_OID, (value: string) => {
    if (!value) return null;
    // "2026-07-24 08:28:36.817482" -> "2026-07-24T08:28:36.817Z"
    const iso = value.replace(' ', 'T').replace(/(\.\d{3})\d+$/, '$1');
    const parsed = new Date(`${iso}Z`);
    return Number.isNaN(parsed.getTime()) ? new Date(value) : parsed;
});

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

// Writes must stay UTC no matter what the database's default TimeZone is set to,
// since NOW() cast into a naive `timestamp` column records the *session* zone's
// wall-clock. Reads are converted to APP_TIME_ZONE at render time.
pool.on('connect', (client) => {
    client.query("SET TIME ZONE 'UTC'").catch((err) => {
        console.error('Failed to pin session timezone to UTC', err);
    });
});

// The pg Pool is the single connection source for the app; lib/drizzle.ts wraps
// it. All data access goes through Drizzle (db / db.execute / db.transaction).
export default pool;
