import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db, schema, type Tx } from '@/lib/drizzle';

const { coupons, couponRedemptions } = schema;

export interface CouponFields {
    code: string;
    description: string | null;
    discountType: string;
    discountValue: number;
    maxDiscountCents: number | null;
    currency: string | null;
    minOrderCents: number;
    maxRedemptions: number | null;
    perCustomerLimit: number | null;
    applicablePlanIds: number[] | null;
    validFrom: string | null;
    validUntil: string | null;
    isActive: boolean;
    isPublic: boolean;
}

// Explicit snake_case projection so the API/UI (CouponDTO) keys match the rows.
const couponColumns = {
    id: coupons.id,
    code: coupons.code,
    description: coupons.description,
    discount_type: coupons.discountType,
    discount_value: coupons.discountValue,
    max_discount_cents: coupons.maxDiscountCents,
    currency: coupons.currency,
    min_order_cents: coupons.minOrderCents,
    max_redemptions: coupons.maxRedemptions,
    times_redeemed: coupons.timesRedeemed,
    per_customer_limit: coupons.perCustomerLimit,
    applicable_plan_ids: coupons.applicablePlanIds,
    valid_from: coupons.validFrom,
    valid_until: coupons.validUntil,
    is_active: coupons.isActive,
    is_public: coupons.isPublic,
    created_at: coupons.createdAt,
    updated_at: coupons.updatedAt,
};

export async function listCoupons(): Promise<Record<string, unknown>[]> {
    const rows = await db.select(couponColumns).from(coupons).orderBy(desc(coupons.createdAt), asc(coupons.id));
    return rows as Record<string, unknown>[];
}

export async function findCouponById(id: number): Promise<Record<string, unknown> | null> {
    const rows = await db.select(couponColumns).from(coupons).where(eq(coupons.id, id)).limit(1);
    return rows[0] ?? null;
}

/** Look up an active coupon by code (case-insensitive). Used at checkout/validation. */
export async function findCouponByCode(tx: Tx | typeof db, code: string): Promise<Record<string, unknown> | null> {
    const rows = await tx.select(couponColumns).from(coupons)
        .where(eq(coupons.code, code.trim().toUpperCase())).limit(1);
    return rows[0] ?? null;
}

export async function countCustomerRedemptions(tx: Tx | typeof db, couponId: number, customerId: number): Promise<number> {
    const rows = await tx.select({ n: sql<number>`count(*)::int` }).from(couponRedemptions)
        .where(and(eq(couponRedemptions.couponId, couponId), eq(couponRedemptions.customerUserId, customerId)));
    return rows[0]?.n ?? 0;
}

export async function insertCoupon(f: CouponFields): Promise<Record<string, unknown>> {
    const rows = await db.insert(coupons).values({
        code: f.code,
        description: f.description,
        discountType: f.discountType,
        discountValue: f.discountValue,
        maxDiscountCents: f.maxDiscountCents,
        currency: f.currency,
        minOrderCents: f.minOrderCents,
        maxRedemptions: f.maxRedemptions,
        perCustomerLimit: f.perCustomerLimit,
        applicablePlanIds: f.applicablePlanIds,
        validFrom: f.validFrom,
        validUntil: f.validUntil,
        isActive: f.isActive,
        isPublic: f.isPublic,
    }).returning();
    return rows[0];
}

export async function updateCoupon(id: number, f: Partial<CouponFields>): Promise<Record<string, unknown> | null> {
    const rows = await db.update(coupons).set({
        ...(f.code !== undefined ? { code: f.code } : {}),
        ...(f.description !== undefined ? { description: f.description } : {}),
        ...(f.discountType !== undefined ? { discountType: f.discountType } : {}),
        ...(f.discountValue !== undefined ? { discountValue: f.discountValue } : {}),
        ...(f.maxDiscountCents !== undefined ? { maxDiscountCents: f.maxDiscountCents } : {}),
        ...(f.currency !== undefined ? { currency: f.currency } : {}),
        ...(f.minOrderCents !== undefined ? { minOrderCents: f.minOrderCents } : {}),
        ...(f.maxRedemptions !== undefined ? { maxRedemptions: f.maxRedemptions } : {}),
        ...(f.perCustomerLimit !== undefined ? { perCustomerLimit: f.perCustomerLimit } : {}),
        ...(f.applicablePlanIds !== undefined ? { applicablePlanIds: f.applicablePlanIds } : {}),
        ...(f.validFrom !== undefined ? { validFrom: f.validFrom } : {}),
        ...(f.validUntil !== undefined ? { validUntil: f.validUntil } : {}),
        ...(f.isActive !== undefined ? { isActive: f.isActive } : {}),
        ...(f.isPublic !== undefined ? { isPublic: f.isPublic } : {}),
        updatedAt: sql`NOW()`,
    }).where(eq(coupons.id, id)).returning();
    return rows[0] ?? null;
}

/**
 * Coupons safe to advertise on the public storefront for a given plan: marked
 * public, active, within the validity window, not globally exhausted, and either
 * unrestricted or applicable to the plan.
 */
export async function listPublicCoupons(planId: number): Promise<Record<string, unknown>[]> {
    const { rows } = await db.execute(sql`
        SELECT code, description, discount_type, discount_value, max_discount_cents, currency, min_order_cents
        FROM coupons
        WHERE is_public = true
          AND is_active = true
          AND (valid_from IS NULL OR valid_from <= NOW())
          AND (valid_until IS NULL OR valid_until >= NOW())
          AND (max_redemptions IS NULL OR times_redeemed < max_redemptions)
          AND (applicable_plan_ids IS NULL OR array_length(applicable_plan_ids, 1) IS NULL OR ${planId} = ANY(applicable_plan_ids))
        ORDER BY created_at DESC
        LIMIT 12`);
    return rows as Record<string, unknown>[];
}

export async function deleteCoupon(id: number): Promise<boolean> {
    const rows = await db.delete(coupons).where(eq(coupons.id, id)).returning({ id: coupons.id });
    return rows.length > 0;
}

/**
 * Record a paid coupon redemption and bump the global counter, atomically inside
 * the caller's transaction. The unique constraint on order_id makes this safe
 * against callback retries (a duplicate insert throws and is caught upstream).
 */
export async function redeemCoupon(tx: Tx, couponId: number, customerId: number, orderId: number, discountCents: number): Promise<void> {
    await tx.insert(couponRedemptions).values({ couponId, customerUserId: customerId, orderId, discountCents });
    await tx.update(coupons).set({ timesRedeemed: sql`times_redeemed + 1` }).where(eq(coupons.id, couponId));
}
