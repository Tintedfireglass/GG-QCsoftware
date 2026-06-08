import { desc, eq, sql, type SQL } from 'drizzle-orm';
import { db, schema, type Tx } from '@/lib/drizzle';
import { AuthenticatedUser } from '@/lib/auth-middleware';

const { machines, machineHistory, licenseKeys, licenseKeyActivations } = schema;

const SELF_ROLES = ['Technician', 'Client', 'B2CDevice', 'Employee'];
const TEAM_ROLES = ['Refurbisher', 'Enterprise', 'OEM', 'Insurer', 'Reseller'];

export interface ActivationStatus {
    is_active: boolean;
    expires_at: string | null;
}

export async function findActivation(tx: Tx, machineSerial: string): Promise<ActivationStatus | null> {
    const rows = await tx
        .select({ is_active: licenseKeys.isActive, expires_at: licenseKeys.expiresAt })
        .from(licenseKeyActivations)
        .innerJoin(licenseKeys, eq(licenseKeys.id, licenseKeyActivations.licenseKeyId))
        .where(eq(licenseKeyActivations.machineSerial, machineSerial))
        .orderBy(desc(licenseKeyActivations.activatedAt))
        .limit(1);
    const r = rows[0];
    return r ? { is_active: r.is_active ?? false, expires_at: r.expires_at } : null;
}

/** Find a machine by numeric id or serial; touch last_seen, or create it. */
export async function findOrCreateMachine(tx: Tx, machineIdRaw: string): Promise<number> {
    const numeric = /^[0-9]+$/.test(machineIdRaw) ? parseInt(machineIdRaw, 10) : null;
    let found = numeric !== null
        ? await tx.select({ id: machines.id }).from(machines).where(eq(machines.id, numeric)).limit(1)
        : [];
    if (!found.length) {
        found = await tx.select({ id: machines.id }).from(machines).where(eq(machines.machineId, machineIdRaw)).limit(1);
    }
    if (found.length) {
        await tx.update(machines).set({ lastSeen: sql`NOW()` }).where(eq(machines.id, found[0].id));
        return found[0].id;
    }
    const ins = await tx.insert(machines).values({ machineId: machineIdRaw, lastSeen: sql`NOW()` }).returning({ id: machines.id });
    return ins[0].id;
}

export interface NewMachineHistory {
    machineId: number;
    timestamp: string;
    source: string;
    componentGrades: unknown;
    createdBy: number;
    appVersion: string | null;
}

export async function insertMachineHistory(tx: Tx, v: NewMachineHistory): Promise<number> {
    const rows = await tx.insert(machineHistory).values({
        machineId: v.machineId,
        timestamp: v.timestamp,
        source: v.source,
        componentGrades: v.componentGrades,
        createdBy: v.createdBy,
        appVersion: v.appVersion,
    }).returning({ id: machineHistory.id });
    return rows[0].id;
}

/** Latest two history rows per machine within `recentDays`, role-scoped. */
export async function listRecentHistoryPairs(user: AuthenticatedUser, recentDays: number): Promise<Record<string, unknown>[]> {
    const conds: SQL[] = [];
    if (SELF_ROLES.includes(user.role)) {
        conds.push(sql`mh.created_by = ${user.id}`);
    } else if (TEAM_ROLES.includes(user.role)) {
        conds.push(sql`(mh.created_by = ${user.id} OR mh.created_by IN (SELECT id FROM users WHERE created_by = ${user.id}))`);
    }
    conds.push(sql`mh.timestamp >= NOW() - make_interval(days => ${recentDays})`);
    const whereSql = sql`WHERE ${sql.join(conds, sql` AND `)}`;

    const { rows } = await db.execute(sql`
        WITH scoped AS (
            SELECT
                mh.machine_id, mh.timestamp, mh.component_grades,
                m.machine_id as machine_identifier, m.custom_name as custom_name,
                ROW_NUMBER() OVER (PARTITION BY mh.machine_id ORDER BY mh.timestamp DESC, mh.id DESC) AS rn
            FROM machine_history mh
            JOIN machines m ON m.id = mh.machine_id
            ${whereSql}
        )
        SELECT * FROM scoped WHERE rn <= 2 ORDER BY machine_id, rn`);
    return rows as Record<string, unknown>[];
}
