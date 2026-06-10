import { config } from 'dotenv';
config({ path: '.env.local' });
import { sql } from 'drizzle-orm';
import { db } from './lib/drizzle';

async function main() {
    await db.execute(sql`ALTER TABLE qc_results ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false NOT NULL;`);
    console.log('Done');
    process.exit(0);
}
main();
