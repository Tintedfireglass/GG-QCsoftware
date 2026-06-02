import { eq, sql } from 'drizzle-orm';
import { db, schema, type Tx } from '@/lib/drizzle';
import { AuthenticatedUser } from '@/lib/auth-middleware';

const { licenseKeys, users } = schema;

/** List license keys with activation counts and customer info, role-scoped. */
export async function listLicenses(user: AuthenticatedUser): Promise<Record<string, unknown>[]> {
    const scope = user.role === 'SuperAdmin' ? sql`` : sql`WHERE lk.created_by = ${user.id}`;
    const { rows } = await db.execute(sql`
        SELECT
            lk.*,
            COUNT(lka.id) as activations_count,
            cu.full_name as customer_full_name,
            cu.email as customer_email,
            COALESCE(NULLIF(lk.demo_customer_name, ''), cu.full_name, cu.email) as customer_name
        FROM license_keys lk
        LEFT JOIN license_key_activations lka ON lk.id = lka.license_key_id
        LEFT JOIN customer_users cu ON lk.customer_user_id = cu.id
        ${scope}
        GROUP BY lk.id, cu.full_name, cu.email
        ORDER BY lk.created_at DESC`);
    return rows as Record<string, unknown>[];
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
