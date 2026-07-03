import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/drizzle';
import { AuthenticatedUser } from '@/lib/auth-middleware';
import { GLOBAL_ROLES } from '@/lib/shared/domain/visibility';

/**
 * Admin-facing reads over `mobile_reports`. A mobile report is owned by a B2C
 * `customer_users` row, not by an admin user — so a reseller's visibility is
 * derived through the license key the report's device activated:
 *   mobile_reports.device_id → license_key_activations (platform='android')
 *   → license_keys.created_by  (the admin/reseller who issued the key).
 * GLOBAL roles (SuperAdmin/Employee) see everything, including reports from
 * devices that never activated a reseller key.
 */
function visibilityCond(user: AuthenticatedUser): SQL | null {
    if (GLOBAL_ROLES.includes(user.role)) return null;
    // Team scope: the device activated a key created by this user or a member
    // of their team (users whose created_by = this user).
    return sql`EXISTS (
        SELECT 1 FROM license_key_activations lka
        JOIN license_keys lk ON lk.id = lka.license_key_id
        WHERE lka.machine_serial = mr.device_id
          AND lka.platform = 'android'
          AND (lk.created_by = ${user.id}
               OR lk.created_by IN (SELECT id FROM users WHERE created_by = ${user.id})))`;
}

/**
 * Latest android activation owner for a device, for display (reseller name +
 * the key the device redeemed). LATERAL keeps it to one row per report even
 * when a device activated several keys over its lifetime.
 */
const ownerLateral = sql`LEFT JOIN LATERAL (
    SELECT lk.created_by AS owner_id, lk.key AS license_key, u.username AS owner_username,
           u.role AS owner_role, u.display_name AS owner_display_name
    FROM license_key_activations lka
    JOIN license_keys lk ON lk.id = lka.license_key_id
    LEFT JOIN users u ON u.id = lk.created_by
    WHERE lka.machine_serial = mr.device_id AND lka.platform = 'android'
    ORDER BY lka.activated_at DESC NULLS LAST
    LIMIT 1
) attr ON true`;

export interface AdminListFilters {
    limit: number;
    offset: number;
    type?: string;
    deviceId?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    includeTotal: boolean;
}

export async function listAdminReports(
    user: AuthenticatedUser,
    f: AdminListFilters
): Promise<{ reports: Record<string, unknown>[]; total: number | null }> {
    const conds: SQL[] = [];
    const vis = visibilityCond(user);
    if (vis) conds.push(vis);
    if (f.type) conds.push(sql`(mr.report_type = ${f.type} OR mr.test_type = ${f.type})`);
    if (f.deviceId) conds.push(sql`mr.device_id = ${f.deviceId}`);
    if (f.search) {
        const like = `%${f.search}%`;
        conds.push(sql`(mr.report_id ILIKE ${like} OR mr.device_id ILIKE ${like}
            OR cu.phone ILIKE ${like} OR cu.email ILIKE ${like}
            OR cu.first_name ILIKE ${like} OR cu.last_name ILIKE ${like} OR cu.full_name ILIKE ${like})`);
    }
    // Inclusive date range: endDate covers the whole day (< next midnight).
    if (f.startDate) conds.push(sql`mr.tested_at >= ${f.startDate}`);
    if (f.endDate) conds.push(sql`mr.tested_at < (${f.endDate}::date + INTERVAL '1 day')`);
    const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;

    const { rows } = await db.execute(sql`
        SELECT mr.id, mr.report_id, mr.report_type, mr.test_type, mr.result, mr.score, mr.grade,
               mr.passed_count, mr.failed_count, mr.tested_at, mr.created_at,
               mr.customer_user_id, mr.device_id,
               cu.first_name, cu.last_name, cu.full_name, cu.phone, cu.email,
               COALESCE(md.model, mr.device_snapshot_json->>'model') AS device_model,
               COALESCE(mr.payload_json->>'appVersion', mr.payload_json->>'app_version',
                        mr.device_snapshot_json->>'appVersion', mr.device_snapshot_json->>'app_version') AS app_version,
               attr.owner_id, attr.owner_username, attr.owner_display_name, attr.owner_role, attr.license_key
        FROM mobile_reports mr
        LEFT JOIN customer_users cu ON cu.id = mr.customer_user_id
        LEFT JOIN mobile_devices md ON md.customer_user_id = mr.customer_user_id AND md.device_id = mr.device_id
        ${ownerLateral}
        ${where}
        ORDER BY mr.tested_at DESC NULLS LAST, mr.id DESC
        LIMIT ${f.limit} OFFSET ${f.offset}`);

    let total: number | null = null;
    if (f.includeTotal) {
        // Count needs the same customer join only when a search filter references it.
        const { rows: cRows } = await db.execute(sql`
            SELECT COUNT(*)::int AS n
            FROM mobile_reports mr
            LEFT JOIN customer_users cu ON cu.id = mr.customer_user_id
            ${where}`);
        total = Number((cRows[0] as { n: number })?.n ?? 0);
    }
    return { reports: rows as Record<string, unknown>[], total };
}

/** Single report (full payload) scoped to what `user` may see. */
export async function findAdminReport(
    user: AuthenticatedUser,
    reportId: string
): Promise<Record<string, unknown> | null> {
    const conds: SQL[] = [sql`mr.report_id = ${reportId}`];
    const vis = visibilityCond(user);
    if (vis) conds.push(vis);
    const where = sql.join(conds, sql` AND `);

    const { rows } = await db.execute(sql`
        SELECT mr.id, mr.report_id, mr.report_type, mr.test_type, mr.result, mr.score, mr.grade,
               mr.passed_count, mr.failed_count, mr.tested_at, mr.created_at,
               mr.customer_user_id, mr.device_id, mr.payload_json, mr.device_snapshot_json,
               cu.first_name, cu.last_name, cu.full_name, cu.phone, cu.email,
               COALESCE(md.model, mr.device_snapshot_json->>'model') AS device_model,
               COALESCE(mr.payload_json->>'appVersion', mr.payload_json->>'app_version',
                        mr.device_snapshot_json->>'appVersion', mr.device_snapshot_json->>'app_version') AS app_version,
               attr.owner_id, attr.owner_username, attr.owner_display_name, attr.owner_role, attr.license_key
        FROM mobile_reports mr
        LEFT JOIN customer_users cu ON cu.id = mr.customer_user_id
        LEFT JOIN mobile_devices md ON md.customer_user_id = mr.customer_user_id AND md.device_id = mr.device_id
        ${ownerLateral}
        WHERE ${where}
        LIMIT 1`);
    return (rows[0] as Record<string, unknown>) ?? null;
}

/** Stress-test perfGraph samples for a report (by numeric mobile_reports.id). */
export async function findStressSamples(reportId: string): Promise<Record<string, unknown>[]> {
    const { rows } = await db.execute(sql`
        SELECT mss.elapsed_sec, mss.gips, mss.phase
        FROM mobile_stress_samples mss
        JOIN mobile_reports mr ON mr.id = mss.mobile_report_id
        WHERE mr.report_id = ${reportId}
        ORDER BY mss.elapsed_sec ASC`);
    return rows as Record<string, unknown>[];
}
