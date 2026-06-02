import { defineConfig } from 'drizzle-kit';

// Parse DATABASE_URL into discrete credentials. drizzle-kit ignores the `ssl`
// option when a `url` is supplied, which stalls against DO's SSL-required DB,
// so we pass host/port/user/password/database + explicit ssl instead.
function dbCredentials() {
    const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
    if (!raw) throw new Error('DATABASE_URL is not set');
    if (/\$\{[^}]+\}/.test(raw)) {
        throw new Error(`DATABASE_URL looks like an unresolved placeholder: "${raw}".`);
    }
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
    // `drizzle-kit pull` writes the introspected schema here.
    schema: './lib/db/schema.ts',
    out: './drizzle',
    dbCredentials: dbCredentials(),
});
