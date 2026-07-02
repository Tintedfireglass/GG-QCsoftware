// Read-only check of migration 0020 state. No writes. (temp)
import { config } from 'dotenv';
import pg from 'pg';

config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) { console.error('No DATABASE_URL'); process.exit(1); }
const cleanUrl = (() => { try { const u = new URL(connectionString); u.searchParams.delete('sslmode'); return u.toString(); } catch { return connectionString; } })();
const pool = new pg.Pool({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });

const q = async (sql) => (await pool.query(sql)).rows;

try {
  const col = await q(`SELECT 1 FROM information_schema.columns WHERE table_name='license_key_activations' AND column_name='customer_user_id'`);
  console.log('1) column customer_user_id exists:', col.length > 0);

  const backfillNeeded = await q(`
    SELECT COUNT(*)::int AS n FROM license_key_activations a
    JOIN license_keys lk ON lk.id = a.license_key_id
    WHERE a.platform='android' AND a.customer_user_id IS NULL AND lk.customer_user_id IS NOT NULL`);
  console.log('2) android activations to backfill:', backfillNeeded[0]?.n);

  const unclaimNeeded = await q(`
    SELECT COUNT(*)::int AS n FROM license_keys
    WHERE type IN ('bulk','demo') AND customer_user_id IS NOT NULL`);
  console.log('3) bulk/demo keys wrongly bound (to un-claim):', unclaimNeeded[0]?.n);

  const idx = await q(`SELECT 1 FROM pg_indexes WHERE indexname='idx_lka_customer_platform'`);
  console.log('4) index idx_lka_customer_platform exists:', idx.length > 0);
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await pool.end();
}
