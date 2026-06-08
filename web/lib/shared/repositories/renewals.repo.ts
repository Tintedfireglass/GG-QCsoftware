import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';

const { licenseKeys, customerOrders } = schema;

export interface DueRenewal {
    key_id: number;
    customer_user_id: number | null;
    renewal_plan_id: number;
    gateway_customer_ref: string;
    gateway_token_ref: string;
    expires_at: string;
    email: string | null;
}

/** License keys with an active mandate whose expiry falls within `withinDays`. */
export async function findDueRenewals(withinDays: number): Promise<DueRenewal[]> {
    const { rows } = await db.execute(sql`
        SELECT lk.id AS key_id, lk.customer_user_id, lk.renewal_plan_id,
               lk.gateway_customer_ref, lk.gateway_token_ref, lk.expires_at,
               cu.email
        FROM license_keys lk
        LEFT JOIN customer_users cu ON cu.id = lk.customer_user_id
        WHERE lk.auto_renew = true
          AND lk.is_active = true
          AND lk.gateway_token_ref IS NOT NULL
          AND lk.renewal_plan_id IS NOT NULL
          AND lk.expires_at IS NOT NULL
          AND lk.expires_at <= NOW() + make_interval(days => ${withinDays})
        ORDER BY lk.expires_at ASC
        LIMIT 200`);
    return rows as unknown as DueRenewal[];
}

export async function extendKeyExpiry(keyId: number, newExpiry: Date): Promise<void> {
    await db.update(licenseKeys).set({ expiresAt: newExpiry.toISOString() }).where(eq(licenseKeys.id, keyId));
}

export async function markRenewalPaid(orderId: number, gatewayRef: string, keyId: number): Promise<void> {
    await db.update(customerOrders).set({
        status: 'paid',
        gatewayReference: gatewayRef || null,
        generatedLicenseKeyId: keyId,
        updatedAt: sql`NOW()`,
    }).where(eq(customerOrders.id, orderId));
}

export async function markRenewalFailed(orderId: number): Promise<void> {
    await db.update(customerOrders).set({
        status: 'failed',
        updatedAt: sql`NOW()`,
    }).where(eq(customerOrders.id, orderId));
}
