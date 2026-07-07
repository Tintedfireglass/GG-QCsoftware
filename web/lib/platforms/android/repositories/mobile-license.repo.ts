import { sql } from 'drizzle-orm';
import { db } from '@/lib/drizzle';

/**
 * The signed-in customer's license keys that cover Android, with cap + usage.
 * A key belongs to the customer if they own it (single_use B2C keys) or have an
 * Android activation on it (shared bulk/demo keys, which stay unowned).
 */
export async function listAndroidLicenses(customerId: number): Promise<Record<string, unknown>[]> {
    const { rows } = await db.execute(sql`
        SELECT lk.key, lk.type, lk.is_active, lk.expires_at, lk.created_at,
               COALESCE((lk.platform_caps->>'android')::int, lk.max_uses, 0) AS android_cap,
               (SELECT COUNT(*)::int FROM license_key_activations a
                 WHERE a.license_key_id = lk.id AND a.platform = 'android') AS android_used
        FROM license_keys lk
        WHERE ('android' = ANY(lk.product_scope) OR 'all' = ANY(lk.product_scope))
          AND (lk.customer_user_id = ${customerId}
               OR EXISTS (SELECT 1 FROM license_key_activations a
                           WHERE a.license_key_id = lk.id
                             AND a.platform = 'android'
                             AND a.customer_user_id = ${customerId}))
        ORDER BY lk.created_at DESC`);
    return rows as Record<string, unknown>[];
}

/** Whether this customer has already activated the given device (on any key). */
export async function isDeviceActivated(customerId: number, deviceId: string): Promise<boolean> {
    const { rows } = await db.execute(sql`
        SELECT 1
        FROM license_key_activations a
        WHERE a.platform = 'android'
          AND a.machine_serial = ${deviceId}
          AND a.customer_user_id = ${customerId}
        LIMIT 1`);
    return rows.length > 0;
}
