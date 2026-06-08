import { sql } from 'drizzle-orm';
import { db } from '@/lib/drizzle';

/** The signed-in customer's license keys that cover Android, with cap + usage. */
export async function listAndroidLicenses(customerId: number): Promise<Record<string, unknown>[]> {
    const { rows } = await db.execute(sql`
        SELECT lk.key, lk.type, lk.is_active, lk.expires_at, lk.created_at,
               COALESCE((lk.platform_caps->>'android')::int, lk.max_uses, 0) AS android_cap,
               (SELECT COUNT(*)::int FROM license_key_activations a
                 WHERE a.license_key_id = lk.id AND a.platform = 'android') AS android_used
        FROM license_keys lk
        WHERE lk.customer_user_id = ${customerId}
          AND ('android' = ANY(lk.product_scope) OR 'all' = ANY(lk.product_scope))
        ORDER BY lk.created_at DESC`);
    return rows as Record<string, unknown>[];
}

/** Whether a specific device is already activated on any of the customer's keys. */
export async function isDeviceActivated(customerId: number, deviceId: string): Promise<boolean> {
    const { rows } = await db.execute(sql`
        SELECT 1
        FROM license_key_activations a
        JOIN license_keys lk ON lk.id = a.license_key_id
        WHERE lk.customer_user_id = ${customerId}
          AND a.platform = 'android'
          AND a.machine_serial = ${deviceId}
        LIMIT 1`);
    return rows.length > 0;
}
