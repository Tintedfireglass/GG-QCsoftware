import { sql } from 'drizzle-orm';
import { db } from '@/lib/drizzle';

function buildWhere(status?: string, search?: string) {
    const conds = [];
    if (status) conds.push(sql`co.status = ${status}`);
    if (search) {
        const like = `%${search}%`;
        conds.push(sql`(cu.email ILIKE ${like} OR co.payment_reference ILIKE ${like} OR co.gateway_reference ILIKE ${like})`);
    }
    return conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
}

export async function listOrdersAdmin(p: { status?: string; search?: string; limit: number; offset: number }): Promise<Record<string, unknown>[]> {
    const where = buildWhere(p.status, p.search);
    const { rows } = await db.execute(sql`
        SELECT co.id, co.plan, co.plan_id, co.amount_cents, co.currency, co.status,
               co.payment_reference, co.gateway_reference, co.generated_license_key_id,
               co.created_at, co.updated_at,
               cu.email AS customer_email, cu.full_name AS customer_name,
               lk.key AS license_key,
               p.name AS plan_name
        FROM customer_orders co
        LEFT JOIN customer_users cu ON cu.id = co.customer_user_id
        LEFT JOIN license_keys lk ON lk.id = co.generated_license_key_id
        LEFT JOIN plans p ON p.id = co.plan_id
        ${where}
        ORDER BY co.created_at DESC
        LIMIT ${p.limit} OFFSET ${p.offset}`);
    return rows as Record<string, unknown>[];
}

export async function countOrdersAdmin(p: { status?: string; search?: string }): Promise<number> {
    const where = buildWhere(p.status, p.search);
    const { rows } = await db.execute(sql`
        SELECT COUNT(*)::int AS n
        FROM customer_orders co
        LEFT JOIN customer_users cu ON cu.id = co.customer_user_id
        ${where}`);
    return (rows[0]?.n as number) ?? 0;
}

export async function getOrderDetailAdmin(id: number): Promise<Record<string, unknown> | null> {
    const { rows } = await db.execute(sql`
        SELECT co.*,
               cu.email AS customer_email, cu.full_name AS customer_name,
               lk.key AS license_key, lk.is_active AS license_active,
               p.name AS plan_name, p.billing_type,
               cp.code AS coupon_code
        FROM customer_orders co
        LEFT JOIN customer_users cu ON cu.id = co.customer_user_id
        LEFT JOIN license_keys lk ON lk.id = co.generated_license_key_id
        LEFT JOIN plans p ON p.id = co.plan_id
        LEFT JOIN coupons cp ON cp.id = co.coupon_id
        WHERE co.id = ${id}
        LIMIT 1`);
    return (rows[0] as Record<string, unknown>) ?? null;
}
