import { sql } from 'drizzle-orm';
import { db } from '@/lib/drizzle';

/** All free trials with their machine identifier (admin view). */
export async function listAllFreeTrials(): Promise<Record<string, unknown>[]> {
    const { rows } = await db.execute(sql`
        SELECT
            ft.id, ft.email, ft.machine_serial, ft.mac_address, ft.computer_name, ft.machine_id,
            m.machine_id as machine_identifier,
            ft.trial_start_utc, ft.trial_end_utc, ft.is_active, ft.revoked_at, ft.revoke_reason, ft.created_at
        FROM free_trials ft
        LEFT JOIN machines m ON ft.machine_id = m.id
        ORDER BY ft.created_at DESC`);
    return rows as Record<string, unknown>[];
}
