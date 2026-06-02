import { drizzle } from 'drizzle-orm/node-postgres';
import pool from './db';
import * as schema from '../drizzle/schema';

/**
 * Drizzle client bound to the SAME pg pool as lib/db.ts — one connection pool
 * for the whole app. Repositories can use `db` (typed queries) or the raw
 * `query`/`transaction` helpers from lib/db.ts side by side during migration.
 */
export const db = drizzle(pool, { schema });

export { schema };

/** Drizzle transaction handle, for repo functions that run inside db.transaction(). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
