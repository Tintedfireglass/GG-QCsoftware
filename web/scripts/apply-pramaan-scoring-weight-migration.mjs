import fs from 'node:fs';
import { Client } from 'pg';

const envPath = new URL('../.env.local', import.meta.url);
const envText = fs.readFileSync(envPath, 'utf8');
const match = envText.match(/^DATABASE_URL="?(.+?)"?$/m);

if (!match) {
  throw new Error('DATABASE_URL not found in web/.env.local');
}

const dbUrl = new URL(match[1]);
const client = new Client({
  host: dbUrl.hostname,
  port: dbUrl.port ? Number(dbUrl.port) : 5432,
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.replace(/^\//, ''),
  ssl: { rejectUnauthorized: false },
});

const sql = `
  UPDATE pramaan_scoring_versions
  SET
    version_id = $1,
    weights = $2::jsonb
  WHERE is_active = true
  RETURNING version_id, weights, is_active;
`;

async function main() {
  await client.connect();
  const result = await client.query(sql, [
    '1.0.3',
    JSON.stringify({
      storage: 0.25,
      thermal: 0.20,
      battery: 0.25,
      cpu_ram: 0.15,
      physical_ports: 0.05,
      repair_modifier: 0.10,
    }),
  ]);

  if (result.rowCount === 0) {
    console.log('No active pramaan_scoring_versions row was updated.');
  } else {
    console.log(JSON.stringify(result.rows, null, 2));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
