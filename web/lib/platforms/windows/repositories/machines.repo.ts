import { and, eq, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';
import { AuthenticatedUser } from '@/lib/auth-middleware';

const { machines } = schema;

/** Columns returned by the single-machine detail/update endpoints. */
const machineDetailColumns = {
    id: machines.id,
    machine_id: machines.machineId,
    serial_number: machines.serialNumber,
    mac_address: machines.macAddress,
    manufacturer: machines.manufacturer,
    model: machines.model,
    computer_name: machines.computerName,
    custom_name: machines.customName,
    last_seen: machines.lastSeen,
    location: machines.location,
    created_at: machines.createdAt,
    asset_tag: machines.assetTag,
    owner_user_id: machines.ownerUserId,
    group_id: machines.groupId,
};

/**
 * Machine visibility differs from QC-result owner visibility: Reseller is
 * grouped with Enterprise/OEM/Insurer (owner OR team-tested), and the self/team
 * roles are scoped via EXISTS over qc_results. Kept explicit here to preserve
 * the exact pre-refactor semantics.
 */
type Visibility =
    | { mode: 'all' }
    | { mode: 'tested-self' }
    | { mode: 'tested-team' }
    | { mode: 'owner-or-team' };

function visibilityFor(user: AuthenticatedUser): Visibility {
    switch (user.role) {
        case 'Technician':
        case 'Client':
        case 'B2CDevice':
            return { mode: 'tested-self' };
        case 'Refurbisher':
            return { mode: 'tested-team' };
        case 'Enterprise':
        case 'OEM':
        case 'Insurer':
        case 'Reseller':
            return { mode: 'owner-or-team' };
        default:
            return { mode: 'all' };
    }
}

/** Count machines visible to the user (fast path for dashboard cards). */
export async function countVisibleMachines(user: AuthenticatedUser): Promise<number> {
    const v = visibilityFor(user);

    let whereSql: SQL | null = null;
    if (v.mode === 'tested-self') {
        whereSql = sql`EXISTS (
            SELECT 1 FROM qc_results qr
            WHERE qr.machine_id = m.id AND qr.technician_id = ${user.id}
        )`;
    } else if (v.mode === 'tested-team') {
        whereSql = sql`EXISTS (
            SELECT 1 FROM qc_results qr
            WHERE qr.machine_id = m.id
              AND (qr.technician_id = ${user.id} OR qr.technician_id IN (SELECT id FROM users WHERE created_by = ${user.id}))
        )`;
    } else if (v.mode === 'owner-or-team') {
        whereSql = sql`(
            m.owner_user_id = ${user.id} OR EXISTS (
                SELECT 1 FROM qc_results qr2
                WHERE qr2.machine_id = m.id
                  AND (qr2.technician_id = ${user.id} OR qr2.technician_id IN (SELECT id FROM users WHERE created_by = ${user.id}))
            )
        )`;
    }

    const q = whereSql
        ? sql`SELECT COUNT(*) as total FROM machines m WHERE ${whereSql}`
        : sql`SELECT COUNT(*) as total FROM machines`;
    const { rows } = await db.execute(q);
    return parseInt((rows[0] as { total?: string })?.total ?? '0', 10);
}

/** List visible machines with aggregated test stats and latest grade/IP. */
export async function listMachinesWithStats(user: AuthenticatedUser): Promise<Record<string, unknown>[]> {
    const v = visibilityFor(user);

    let visibilityWhere: SQL = sql`1=1`;
    let aggWhere: SQL = sql``;

    if (v.mode === 'tested-self') {
        visibilityWhere = sql`EXISTS (
            SELECT 1 FROM qc_results qrs
            WHERE qrs.machine_id = m.id AND qrs.technician_id = ${user.id}
        )`;
        aggWhere = sql`WHERE qr.technician_id = ${user.id}`;
    } else if (v.mode === 'tested-team') {
        visibilityWhere = sql`EXISTS (
            SELECT 1 FROM qc_results qrs
            WHERE qrs.machine_id = m.id
              AND (qrs.technician_id = ${user.id} OR qrs.technician_id IN (SELECT id FROM users WHERE created_by = ${user.id}))
        )`;
        aggWhere = sql`WHERE (qr.technician_id = ${user.id} OR qr.technician_id IN (SELECT id FROM users WHERE created_by = ${user.id}))`;
    } else if (v.mode === 'owner-or-team') {
        visibilityWhere = sql`(
            m.owner_user_id = ${user.id} OR EXISTS (
                SELECT 1 FROM qc_results qr2
                WHERE qr2.machine_id = m.id
                  AND (qr2.technician_id = ${user.id} OR qr2.technician_id IN (SELECT id FROM users WHERE created_by = ${user.id}))
            )
        )`;
    }

    const { rows } = await db.execute(sql`
         WITH agg AS (
             SELECT
               qr.machine_id,
               COUNT(*)::int as test_count,
               MAX(qr.timestamp) as last_test_date,
               SUM(CASE WHEN qr.overall_pass = true THEN 1 ELSE 0 END)::int as passed_count,
               SUM(CASE WHEN qr.overall_pass = false THEN 1 ELSE 0 END)::int as failed_count
             FROM qc_results qr
             ${aggWhere}
             GROUP BY qr.machine_id
         ),
         latest_any AS (
             SELECT DISTINCT ON (qr.machine_id)
               qr.machine_id,
               qr.submission_ip as latest_ip,
               COALESCE(qr.pramaan_grade, qr.overall_grade) as latest_grade
             FROM qc_results qr
             ORDER BY qr.machine_id, qr.timestamp DESC, qr.id DESC
         )
         SELECT
           m.id, m.machine_id, m.serial_number, m.mac_address, m.manufacturer,
           m.model, m.computer_name, m.custom_name, m.last_seen, m.location, m.created_at,
           m.owner_user_id,
           COALESCE(agg.test_count, 0) as test_count,
           agg.last_test_date,
           COALESCE(agg.passed_count, 0) as passed_count,
           COALESCE(agg.failed_count, 0) as failed_count,
           latest_any.latest_ip,
           latest_any.latest_grade
         FROM machines m
         LEFT JOIN agg ON agg.machine_id = m.id
         LEFT JOIN latest_any ON latest_any.machine_id = m.id
         WHERE ${visibilityWhere}
         ORDER BY m.last_seen DESC NULLS LAST`);
    return rows as Record<string, unknown>[];
}

// ── Single-machine detail (Drizzle for typed CRUD; raw SQL for history) ──

/**
 * Drizzle condition restricting access to one machine, mirroring the previous
 * inline access clauses. Role scoping stays expressed as raw `sql` EXISTS
 * fragments (interpolating typed columns), which is where raw SQL still earns
 * its keep; the surrounding query is fully typed.
 */
function machineAccessCondition(user: AuthenticatedUser): SQL | undefined {
    const v = visibilityFor(user);
    if (v.mode === 'all') return undefined;
    if (v.mode === 'tested-self') {
        return sql`EXISTS (
            SELECT 1 FROM qc_results qr
            WHERE qr.machine_id = ${machines.id} AND qr.technician_id = ${user.id}
        )`;
    }
    if (v.mode === 'tested-team') {
        return sql`EXISTS (
            SELECT 1 FROM qc_results qr
            WHERE qr.machine_id = ${machines.id}
              AND (qr.technician_id = ${user.id} OR qr.technician_id IN (SELECT id FROM users WHERE created_by = ${user.id}))
        )`;
    }
    return sql`(${machines.ownerUserId} = ${user.id} OR EXISTS (
        SELECT 1 FROM qc_results qr
        WHERE qr.machine_id = ${machines.id}
          AND (qr.technician_id = ${user.id} OR qr.technician_id IN (SELECT id FROM users WHERE created_by = ${user.id}))
    ))`;
}

/** Fetch one machine the user may access, or null. Typed Drizzle query. */
export async function findAccessibleMachine(user: AuthenticatedUser, id: number) {
    const access = machineAccessCondition(user);
    const where = access ? and(eq(machines.id, id), access) : eq(machines.id, id);
    const rows = await db.select(machineDetailColumns).from(machines).where(where).limit(1);
    return rows[0] ?? null;
}

/** Update a machine's custom name and return the detail row. Typed Drizzle write. */
export async function updateMachineCustomName(id: number, customName: string | null) {
    const rows = await db
        .update(machines)
        .set({ customName })
        .where(eq(machines.id, id))
        .returning(machineDetailColumns);
    return rows[0] ?? null;
}

/** QC-result history for a machine, role-scoped. Read projection via db.execute. */
export async function listTestHistory(user: AuthenticatedUser, id: string): Promise<Record<string, unknown>[]> {
    const machineId = Number(id);
    let clause: SQL = sql``;
    if (user.role === 'Technician' || user.role === 'Client' || user.role === 'B2CDevice') {
        clause = sql` AND technician_id = ${user.id}`;
    } else if (user.role === 'Refurbisher') {
        clause = sql` AND (technician_id = ${user.id} OR technician_id IN (SELECT id FROM users WHERE created_by = ${user.id}))`;
    } else if (user.role === 'Enterprise' || user.role === 'OEM' || user.role === 'Insurer' || user.role === 'Reseller') {
        clause = sql` AND (
            (technician_id = ${user.id} OR technician_id IN (SELECT id FROM users WHERE created_by = ${user.id}))
            OR machine_id IN (SELECT id FROM machines WHERE owner_user_id = ${user.id})
        )`;
    }
    const { rows } = await db.execute(sql`
        SELECT
            id, report_id, timestamp, refurbish_id, overall_pass,
            system_serial, cpu_model, ram_total,
            storage_details_json, battery_details_json, ram_details_json,
            COALESCE(pramaan_grade, overall_grade) as overall_grade
         FROM qc_results
         WHERE machine_id = ${machineId}${clause}
         ORDER BY timestamp DESC`);
    return rows as Record<string, unknown>[];
}

/** Component-grade history for a machine, role-scoped. Read projection via db.execute. */
export async function listMachineHistory(user: AuthenticatedUser, id: string): Promise<Record<string, unknown>[]> {
    const machineId = Number(id);
    let clause: SQL = sql``;
    if (user.role === 'Technician' || user.role === 'Client' || user.role === 'B2CDevice') {
        clause = sql` AND created_by = ${user.id}`;
    } else if (user.role === 'Refurbisher') {
        clause = sql` AND (created_by = ${user.id} OR created_by IN (SELECT id FROM users WHERE created_by = ${user.id}))`;
    } else if (user.role === 'Enterprise' || user.role === 'OEM' || user.role === 'Insurer' || user.role === 'Reseller') {
        clause = sql` AND (
            created_by = ${user.id} OR created_by IN (SELECT id FROM users WHERE created_by = ${user.id})
            OR ${user.id} IN (SELECT owner_user_id FROM machines WHERE id = ${machineId})
        )`;
    }
    const { rows } = await db.execute(sql`
        SELECT id, timestamp, source, component_grades, app_version
         FROM machine_history
         WHERE machine_id = ${machineId}${clause}
         ORDER BY timestamp DESC`);
    return rows as Record<string, unknown>[];
}
