import { eq, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';
import { AuthenticatedUser } from '@/lib/auth-middleware';
import { AppError } from '@/lib/http/errors';
import { TEAM_ROLES } from '@/lib/shared/domain/visibility';
import { UserRole, UserWithCreator } from '@/lib/types';

const { users } = schema;

/** Role values accepted as the `role` list filter (mirrors prior behavior). */
const FILTERABLE_ROLES: UserRole[] = [
    'SuperAdmin', 'Employee', 'Refurbisher', 'Reseller', 'Technician', 'Enterprise', 'Client',
];

/** Detail columns returned by the single-user endpoints (snake_case API keys). */
const userDetailColumns = {
    id: users.id,
    username: users.username,
    email: users.email,
    display_name: users.displayName,
    role: users.role,
    created_by: users.createdBy,
    is_active: users.isActive,
    license_credits: users.licenseCredits,
    created_at: users.createdAt,
    allow_monthly_keys: users.allowMonthlyKeys,
    allow_quarterly_keys: users.allowQuarterlyKeys,
    allow_6month_keys: users.allow6MonthKeys,
    allow_yearly_keys: users.allowYearlyKeys,
    allow_perpetual_keys: users.allowPerpetualKeys,
    allow_windows_keys: users.allowWindowsKeys,
    allow_android_keys: users.allowAndroidKeys,
    allow_ios_keys: users.allowIosKeys,
    allow_mac_keys: users.allowMacKeys,
};

/** Mutable fields on a user update (camelCase schema keys). */
export interface UserUpdateSet {
    email?: string;
    displayName?: string | null;
    role?: string;
    isActive?: boolean;
    passwordHash?: string;
    licenseCredits?: number;
    allowMonthlyKeys?: boolean;
    allowQuarterlyKeys?: boolean;
    allow6MonthKeys?: boolean;
    allowYearlyKeys?: boolean;
    allowPerpetualKeys?: boolean;
    allowWindowsKeys?: boolean;
    allowAndroidKeys?: boolean;
    allowIosKeys?: boolean;
    allowMacKeys?: boolean;
}

export interface ManageableUser {
    id: number;
    role: string;
    created_by: number | null;
    license_credits: number | null;
}

export interface ListUsersOptions {
    limit: number;
    offset: number;
    search?: string;
    role?: string;
}

export interface ListUsersResult {
    users: UserWithCreator[];
    total: number;
}

export async function listUsers(user: AuthenticatedUser, opts: ListUsersOptions): Promise<ListUsersResult> {
    const conds: SQL[] = [];

    // SuperAdmin sees all; team roles see users they created (plus themselves).
    if (TEAM_ROLES.includes(user.role)) {
        conds.push(sql`(u.created_by = ${user.id} OR u.id = ${user.id})`);
    }
    if (opts.search) {
        const like = `%${opts.search}%`;
        conds.push(sql`(u.username ILIKE ${like} OR u.email ILIKE ${like} OR u.display_name ILIKE ${like})`);
    }
    if (opts.role && FILTERABLE_ROLES.includes(opts.role as UserRole)) {
        conds.push(sql`u.role = ${opts.role}`);
    }

    const whereSql = conds.length ? sql.join(conds, sql` AND `) : sql`1=1`;

    const [countRes, listRes] = await Promise.all([
        db.execute(sql`SELECT COUNT(*) as total FROM users u WHERE ${whereSql}`),
        db.execute(sql`
            SELECT
                u.id, u.username, u.email, u.display_name, u.role, u.created_by,
                u.is_active, u.license_credits, u.created_at,
                creator.username as creator_username,
                COALESCE(team.team_size, 0) as team_size
             FROM users u
             LEFT JOIN users creator ON u.created_by = creator.id
             LEFT JOIN (
                 SELECT created_by, COUNT(*)::int as team_size
                 FROM users
                 WHERE created_by IS NOT NULL
                 GROUP BY created_by
             ) team ON team.created_by = u.id
             WHERE ${whereSql}
             ORDER BY u.created_at DESC
             LIMIT ${opts.limit} OFFSET ${opts.offset}`),
    ]);

    const total = parseInt((countRes.rows[0] as { total?: string })?.total ?? '0', 10);
    return { users: listRes.rows as unknown as UserWithCreator[], total };
}

/** Aggregate user counts, role-scoped (team roles: Refurbisher/Enterprise/Reseller). */
export async function userStats(user: AuthenticatedUser): Promise<{ total: number; admins: number; technicians: number }> {
    const teamScoped = user.role === 'Refurbisher' || user.role === 'Enterprise' || user.role === 'Reseller';
    const whereSql = teamScoped
        ? sql`WHERE (u.created_by = ${user.id} OR u.id = ${user.id})`
        : sql`WHERE 1=1`;
    const { rows } = await db.execute(sql`
        SELECT
          COUNT(*)::text AS total,
          SUM(CASE WHEN u.role IN ('Refurbisher','Enterprise','Reseller','SuperAdmin') THEN 1 ELSE 0 END)::text AS admins,
          SUM(CASE WHEN u.role = 'Technician' THEN 1 ELSE 0 END)::text AS technicians
        FROM users u
        ${whereSql}`);
    const row = (rows[0] as { total?: string; admins?: string; technicians?: string }) ?? {};
    return {
        total: parseInt(row.total ?? '0', 10),
        admins: parseInt(row.admins ?? '0', 10),
        technicians: parseInt(row.technicians ?? '0', 10),
    };
}

// ── Single-user detail / update / delete ──

/** Full detail row (creator username + team size) for GET /api/users/[id]. */
export async function findUserDetail(userId: number): Promise<Record<string, unknown> | null> {
    const { rows } = await db.execute(sql`
        SELECT
            u.id, u.username, u.email, u.display_name, u.role, u.created_by,
            u.is_active, u.license_credits, u.created_at,
            u.allow_monthly_keys, u.allow_quarterly_keys, u.allow_6month_keys,
            u.allow_yearly_keys, u.allow_perpetual_keys,
            u.allow_windows_keys, u.allow_android_keys, u.allow_ios_keys, u.allow_mac_keys,
            creator.username as creator_username,
            (SELECT COUNT(*) FROM users WHERE created_by = u.id) as team_size
        FROM users u
        LEFT JOIN users creator ON u.created_by = creator.id
        WHERE u.id = ${userId}`);
    return (rows[0] as Record<string, unknown>) ?? null;
}

/** Minimal row used for management authorization checks. */
export async function findUserForManage(userId: number): Promise<ManageableUser | null> {
    const rows = await db
        .select({ id: users.id, role: users.role, created_by: users.createdBy, license_credits: users.licenseCredits })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    const r = rows[0];
    return r ? { id: r.id, role: r.role ?? '', created_by: r.created_by, license_credits: r.license_credits } : null;
}

/** Fetch the detail columns for a user (no creator/team subqueries). */
export async function findUserBasic(userId: number): Promise<Record<string, unknown> | null> {
    const rows = await db.select(userDetailColumns).from(users).where(eq(users.id, userId)).limit(1);
    return rows[0] ?? null;
}

/** Apply field updates and return the fresh detail row. */
export async function updateUser(userId: number, set: UserUpdateSet): Promise<Record<string, unknown> | null> {
    const rows = await db.update(users).set(set).where(eq(users.id, userId)).returning(userDetailColumns);
    return rows[0] ?? null;
}

export async function deactivateUser(userId: number): Promise<void> {
    await db.update(users).set({ isActive: false }).where(eq(users.id, userId));
}

/**
 * Reseller credit allocation: atomically move `delta` credits from the reseller
 * to the target client (locking the reseller row), apply any other field
 * updates, and return the fresh detail row. Throws 403 on insufficient credits.
 */
export async function allocateResellerCreditsAndUpdate(opts: {
    resellerId: number;
    userId: number;
    desiredCredits: number;
    delta: number;
    set: UserUpdateSet;
    hasFieldUpdates: boolean;
}): Promise<Record<string, unknown> | null> {
    return db.transaction(async (tx) => {
        const lock = await tx
            .select({ credits: users.licenseCredits })
            .from(users)
            .where(eq(users.id, opts.resellerId))
            .for('update');
        const resellerCredits = Number(lock[0]?.credits ?? 0);

        if (opts.delta > 0 && resellerCredits < opts.delta) {
            throw new AppError(403, 'Credit Error', 'Insufficient license credits to allocate');
        }

        if (opts.delta !== 0) {
            await tx.update(users)
                .set({ licenseCredits: sql`${users.licenseCredits} - ${opts.delta}` })
                .where(eq(users.id, opts.resellerId));
            await tx.update(users)
                .set({ licenseCredits: opts.desiredCredits })
                .where(eq(users.id, opts.userId));
        }
        if (opts.hasFieldUpdates) {
            await tx.update(users).set(opts.set).where(eq(users.id, opts.userId));
        }

        const rows = await tx.select(userDetailColumns).from(users).where(eq(users.id, opts.userId)).limit(1);
        return rows[0] ?? null;
    });
}
