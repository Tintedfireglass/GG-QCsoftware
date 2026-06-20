import { sql } from 'drizzle-orm';
import { db } from '@/lib/drizzle';

/** Search predicate across email / machine identifiers (admin free-trials view). */
function buildFreeTrialWhere(search?: string) {
    if (!search) return sql``;
    const like = `%${search}%`;
    return sql`WHERE (
        ft.email ILIKE ${like}
        OR ft.machine_serial ILIKE ${like}
        OR COALESCE(ft.mac_address, '') ILIKE ${like}
        OR COALESCE(ft.computer_name, '') ILIKE ${like}
        OR COALESCE(m.machine_id, '') ILIKE ${like}
    )`;
}

/** Paginated free trials with their machine identifier (admin view). */
export async function listAllFreeTrials(p: { search?: string; limit: number; offset: number }): Promise<Record<string, unknown>[]> {
    const where = buildFreeTrialWhere(p.search);
    const { rows } = await db.execute(sql`
        SELECT
            ft.id, ft.email, ft.machine_serial, ft.mac_address, ft.computer_name, ft.machine_id,
            m.machine_id as machine_identifier,
            ft.trial_start_utc, ft.trial_end_utc, ft.is_active, ft.revoked_at, ft.revoke_reason, ft.created_at
        FROM free_trials ft
        LEFT JOIN machines m ON ft.machine_id = m.id
        ${where}
        ORDER BY ft.created_at DESC
        LIMIT ${p.limit} OFFSET ${p.offset}`);
    return rows as Record<string, unknown>[];
}

/** Total free trials matching the search (for pagination). */
export async function countFreeTrials(p: { search?: string }): Promise<number> {
    const where = buildFreeTrialWhere(p.search);
    const { rows } = await db.execute(sql`
        SELECT COUNT(*)::int AS n
        FROM free_trials ft
        LEFT JOIN machines m ON ft.machine_id = m.id
        ${where}`);
    return (rows[0]?.n as number) ?? 0;
}
