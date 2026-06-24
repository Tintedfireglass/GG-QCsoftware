import { eq, sql, type SQL } from 'drizzle-orm';
import { db, schema, type Tx } from '@/lib/drizzle';
import { AuthenticatedUser } from '@/lib/auth-middleware';

const { licenseKeys, users } = schema;

export const LICENSE_STATUSES = ['active', 'exhausted', 'expired', 'revoked'] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export interface LicenseFilters {
    search?: string;
    status?: string;
    sort?: string;
}

/**
 * CTE that, per key, joins activation counts + customer info and derives:
 *  - effective_uses = max(current_uses, activation count)
 *  - computed_status (active/exhausted/expired/revoked) — mirrors the UI's getKeyStatus().
 * Role-scoped: SuperAdmin sees all keys; others only their own.
 */
function classifiedCte(user: AuthenticatedUser): SQL {
    const scope = user.role === 'SuperAdmin' ? sql`` : sql`WHERE lk.created_by = ${user.id}`;
    return sql`
        base AS (
            SELECT
                lk.*,
                COUNT(lka.id) AS activations_count,
                cu.full_name AS customer_full_name,
                cu.email AS customer_email,
                COALESCE(NULLIF(lk.demo_customer_name, ''), cu.full_name, cu.email) AS customer_name,
                GREATEST(COALESCE(lk.current_uses, 0), COUNT(lka.id)) AS effective_uses
            FROM license_keys lk
            LEFT JOIN license_key_activations lka ON lk.id = lka.license_key_id
            LEFT JOIN customer_users cu ON lk.customer_user_id = cu.id
            ${scope}
            GROUP BY lk.id, cu.full_name, cu.email
        ),
        classified AS (
            SELECT base.*,
                CASE
                    WHEN is_active IS NOT TRUE THEN 'revoked'
                    WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 'expired'
                    WHEN effective_uses >= max_uses THEN 'exhausted'
                    ELSE 'active'
                END AS computed_status
            FROM base
        )`;
}

/** WHERE over the classified CTE: free-text search + computed status filter. */
function buildLicenseWhere(f: LicenseFilters): SQL {
    const conds: SQL[] = [];
    if (f.search) {
        const like = `%${f.search}%`;
        conds.push(sql`(key ILIKE ${like} OR COALESCE(customer_name, '') ILIKE ${like})`);
    }
    if (f.status && (LICENSE_STATUSES as readonly string[]).includes(f.status)) {
        conds.push(sql`computed_status = ${f.status}`);
    }
    return conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
}

/** ORDER BY over the classified CTE; sort key is validated upstream. */
function buildLicenseOrder(sort?: string): SQL {
    switch (sort) {
        case 'created_asc':
            return sql`ORDER BY created_at ASC`;
        case 'activation_desc':
            return sql`ORDER BY effective_uses DESC, created_at DESC`;
        case 'activation_asc':
            return sql`ORDER BY effective_uses ASC, created_at DESC`;
        case 'status':
            return sql`ORDER BY CASE computed_status WHEN 'active' THEN 1 WHEN 'exhausted' THEN 2 WHEN 'expired' THEN 3 ELSE 4 END, created_at DESC`;
        case 'created_desc':
        default:
            return sql`ORDER BY created_at DESC`;
    }
}

/** Paginated, role-scoped, filtered + sorted license keys. */
export async function listLicenses(
    user: AuthenticatedUser,
    f: LicenseFilters & { limit: number; offset: number }
): Promise<Record<string, unknown>[]> {
    const { rows } = await db.execute(sql`
        WITH ${classifiedCte(user)}
        SELECT * FROM classified
        ${buildLicenseWhere(f)}
        ${buildLicenseOrder(f.sort)}
        LIMIT ${f.limit} OFFSET ${f.offset}`);
    return rows as Record<string, unknown>[];
}

/** Total keys matching the filters (for pagination). */
export async function countLicenses(user: AuthenticatedUser, f: LicenseFilters): Promise<number> {
    const { rows } = await db.execute(sql`
        WITH ${classifiedCte(user)}
        SELECT COUNT(*)::int AS n FROM classified ${buildLicenseWhere(f)}`);
    return (rows[0]?.n as number) ?? 0;
}

export async function getUserCredits(tx: Tx, userId: number): Promise<number> {
    const rows = await tx.select({ credits: users.licenseCredits }).from(users).where(eq(users.id, userId)).limit(1);
    return rows[0]?.credits ?? 0;
}

export async function deductCredits(tx: Tx, userId: number, amount: number): Promise<void> {
    await tx.update(users)
        .set({ licenseCredits: sql`${users.licenseCredits} - ${amount}` })
        .where(eq(users.id, userId));
}

export interface NewLicenseFields {
    key: string;
    type: string;
    maxUses: number;
    createdBy: number;
    expiresAt: Date | null;
    demoCustomerName: string | null;
    demoMaxRuns: number | null;
    productScope: string[];
    platformCaps: Record<string, number>;
}

export async function insertLicenseKey(tx: Tx, f: NewLicenseFields): Promise<Record<string, unknown>> {
    const rows = await tx.insert(licenseKeys).values({
        key: f.key,
        type: f.type,
        maxUses: f.maxUses,
        currentUses: 0,
        createdBy: f.createdBy,
        isActive: true,
        expiresAt: f.expiresAt ? f.expiresAt.toISOString() : null,
        demoCustomerName: f.demoCustomerName,
        demoMaxRuns: f.demoMaxRuns,
        productScope: f.productScope,
        platformCaps: f.platformCaps,
    }).returning();
    return rows[0];
}

/**
 * Toggle a key's active flag and write an audit row atomically (single CTE).
 * Returns the updated row, or null if no key matched (id missing or not owned).
 * `restrictToCreator` scopes the update to the caller's own keys (non-SuperAdmin).
 */
export async function toggleActiveWithAudit(
    tx: Tx,
    opts: { id: number; isActive: boolean; performedBy: number; restrictToCreator: number | null }
): Promise<Record<string, unknown> | null> {
    const ownership = opts.restrictToCreator !== null
        ? sql` AND created_by = ${opts.restrictToCreator}`
        : sql``;

    const { rows } = await tx.execute(sql`
        WITH target AS (
            SELECT id, is_active FROM license_keys
            WHERE id = ${opts.id}${ownership}
            FOR UPDATE
        ),
        updated AS (
            UPDATE license_keys SET is_active = ${opts.isActive}
            WHERE id IN (SELECT id FROM target)
            RETURNING *
        ),
        audit AS (
            INSERT INTO license_key_audits (license_key_id, action, previous_is_active, new_is_active, performed_by)
            SELECT
                target.id,
                CASE WHEN ${opts.isActive} = true THEN 'enable' ELSE 'disable' END,
                target.is_active,
                updated.is_active,
                ${opts.performedBy}
            FROM target, updated
            RETURNING 1
        )
        SELECT * FROM updated`);
    return (rows[0] as Record<string, unknown>) ?? null;
}
