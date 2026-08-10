import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// Loads Cirtyn (US) credentials from .env.cirtyn
config({ path: '.env.cirtyn' });

function dbCredentials() {
    const raw = process.env.CIRTYN_DATABASE_URL || '';
    if (!raw) throw new Error('CIRTYN_DATABASE_URL is not set in .env.cirtyn');
    const u = new URL(raw);
    return {
        host: u.hostname,
        port: u.port ? parseInt(u.port, 10) : 5432,
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.replace(/^\//, ''),
        ssl: { rejectUnauthorized: false },
    };
}

export default defineConfig({
    dialect: 'postgresql',
    schema: './drizzle/schema.ts',
    out: './drizzle',
    dbCredentials: dbCredentials(),
});
