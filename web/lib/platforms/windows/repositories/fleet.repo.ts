import { and, eq, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';
import { AuthenticatedUser } from '@/lib/auth-middleware';

const { machines, machineLifecycleEvents } = schema;

/** Roles scoped to machines they own (SuperAdmin sees all). */
const FLEET_OWNER_ROLES = ['Enterprise', 'OEM', 'Insurer', 'Reseller'];

export async function listFleet(
    user: AuthenticatedUser,
    opts: { groupId?: number; search?: string }
): Promise<Record<string, unknown>[]> {
    const conds: SQL[] = [];
    if (FLEET_OWNER_ROLES.includes(user.role)) conds.push(sql`m.owner_user_id = ${user.id}`);
    if (opts.groupId !== undefined) conds.push(sql`m.group_id = ${opts.groupId}`);
    if (opts.search) {
        const like = `%${opts.search}%`;
        conds.push(sql`(
            m.machine_id ILIKE ${like} OR m.serial_number ILIKE ${like} OR
            m.manufacturer ILIKE ${like} OR m.model ILIKE ${like} OR
            COALESCE(m.computer_name, '') ILIKE ${like} OR COALESCE(m.asset_tag, '') ILIKE ${like}
        )`);
    }
    const whereSql = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;

    const { rows } = await db.execute(sql`
        SELECT
            m.id, m.machine_id, m.serial_number, m.manufacturer, m.model,
            m.asset_tag, m.group_id, m.last_seen,
            mg.name as group_name,
            latest_qr.health_score as latest_score,
            latest_qr.health_grade as latest_grade,
            latest_qr.timestamp as latest_test_date,
            COALESCE(mle.lifecycle_event_count, 0) as lifecycle_event_count
        FROM machines m
        LEFT JOIN machine_groups mg ON m.group_id = mg.id
        LEFT JOIN (
            SELECT machine_id, COUNT(*)::int as lifecycle_event_count
            FROM machine_lifecycle_events GROUP BY machine_id
        ) mle ON mle.machine_id = m.id
        LEFT JOIN LATERAL (
            SELECT health_score, health_grade, timestamp
            FROM qc_results WHERE machine_id = m.id
            ORDER BY timestamp DESC LIMIT 1
        ) latest_qr ON true
        ${whereSql}
        ORDER BY m.last_seen DESC NULLS LAST`);
    return rows as Record<string, unknown>[];
}

export async function isOwnedBy(user: AuthenticatedUser, machineId: number): Promise<boolean> {
    const rows = await db.select({ id: machines.id }).from(machines)
        .where(and(eq(machines.id, machineId), eq(machines.ownerUserId, user.id))).limit(1);
    return rows.length > 0;
}

export interface EnrollOptions {
    machineId: string;
    assetTag: string | null;
    groupId: number | null;
    serialNumber: string | null;
    manufacturer: string | null;
    model: string | null;
    ownerId: number;
    recordedByUsername: string;
}

/** Claim or create a machine for the fleet and log an 'enrolled' lifecycle event. */
export async function enrollMachine(opts: EnrollOptions): Promise<number> {
    return db.transaction(async (tx) => {
        const existing = await tx.select({ id: machines.id }).from(machines)
            .where(eq(machines.machineId, opts.machineId)).limit(1);

        let machineDbId: number;
        if (existing[0]) {
            machineDbId = existing[0].id;
            await tx.update(machines).set({
                ownerUserId: opts.ownerId,
                assetTag: sql`COALESCE(${opts.assetTag}::varchar, ${machines.assetTag})`,
                groupId: opts.groupId,
            }).where(eq(machines.id, machineDbId));
        } else {
            const ins = await tx.insert(machines).values({
                machineId: opts.machineId,
                serialNumber: opts.serialNumber,
                manufacturer: opts.manufacturer,
                model: opts.model,
                assetTag: opts.assetTag,
                ownerUserId: opts.ownerId,
                groupId: opts.groupId,
                lastSeen: sql`NOW()`,
            }).returning({ id: machines.id });
            machineDbId = ins[0].id;
        }

        await tx.insert(machineLifecycleEvents).values({
            machineId: machineDbId,
            eventType: 'enrolled',
            notes: `Enrolled into fleet by ${opts.recordedByUsername}`,
            recordedBy: opts.ownerId,
        });
        return machineDbId;
    });
}

export async function listLifecycle(machineId: number): Promise<Record<string, unknown>[]> {
    const { rows } = await db.execute(sql`
        SELECT mle.*, u.username as recorded_by_username
        FROM machine_lifecycle_events mle
        LEFT JOIN users u ON mle.recorded_by = u.id
        WHERE mle.machine_id = ${machineId}
        ORDER BY mle.created_at DESC`);
    return rows as Record<string, unknown>[];
}

export async function addLifecycleEvent(
    machineId: number,
    eventType: string,
    notes: string | null,
    recordedBy: number
): Promise<Record<string, unknown>> {
    const { rows } = await db.execute(sql`
        INSERT INTO machine_lifecycle_events (machine_id, event_type, notes, recorded_by)
        VALUES (${machineId}, ${eventType}, ${notes}, ${recordedBy})
        RETURNING *`);
    return rows[0] as Record<string, unknown>;
}
