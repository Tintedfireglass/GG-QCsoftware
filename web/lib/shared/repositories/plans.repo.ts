import { asc, eq, sql } from 'drizzle-orm';
import { db, schema, type Tx } from '@/lib/drizzle';

const { plans } = schema;

export interface PlanFields {
    name: string;
    description: string | null;
    billingType: string;
    interval: string | null;
    priceCents: number;
    currency: string;
    productScope: string[];
    platformCaps: Record<string, number>;
    durationDays: number | null;
    features: string[];
    allowAutoRenew: boolean;
    isActive: boolean;
    sortOrder: number;
}

// Explicit snake_case projection so the API/UI (PlanDTO) keys match the rows.
const planColumns = {
    id: plans.id,
    name: plans.name,
    description: plans.description,
    billing_type: plans.billingType,
    interval: plans.interval,
    price_cents: plans.priceCents,
    currency: plans.currency,
    product_scope: plans.productScope,
    platform_caps: plans.platformCaps,
    duration_days: plans.durationDays,
    features: plans.features,
    allow_auto_renew: plans.allowAutoRenew,
    is_active: plans.isActive,
    sort_order: plans.sortOrder,
    created_at: plans.createdAt,
    updated_at: plans.updatedAt,
};

export async function listPlans(includeInactive: boolean): Promise<Record<string, unknown>[]> {
    const q = db.select(planColumns).from(plans).orderBy(asc(plans.sortOrder), asc(plans.id));
    const rows = includeInactive ? await q : await q.where(eq(plans.isActive, true));
    return rows as Record<string, unknown>[];
}

export interface PlanEntitlement {
    id: number;
    name: string;
    price_cents: number;
    currency: string;
    product_scope: string[];
    platform_caps: Record<string, number>;
    duration_days: number | null;
    billing_type: string;
    interval: string | null;
    allow_auto_renew: boolean;
    is_active: boolean;
}

export async function findPlanById(tx: Tx | typeof db, id: number): Promise<PlanEntitlement | null> {
    const rows = await tx.select({
        id: plans.id,
        name: plans.name,
        price_cents: plans.priceCents,
        currency: plans.currency,
        product_scope: plans.productScope,
        platform_caps: plans.platformCaps,
        duration_days: plans.durationDays,
        billing_type: plans.billingType,
        interval: plans.interval,
        allow_auto_renew: plans.allowAutoRenew,
        is_active: plans.isActive,
    }).from(plans).where(eq(plans.id, id)).limit(1);
    const r = rows[0];
    if (!r) return null;
    return { ...r, product_scope: r.product_scope ?? [], platform_caps: r.platform_caps ?? {} };
}

export async function insertPlan(f: PlanFields): Promise<Record<string, unknown>> {
    const rows = await db.insert(plans).values({
        name: f.name,
        description: f.description,
        billingType: f.billingType,
        interval: f.interval,
        priceCents: f.priceCents,
        currency: f.currency,
        productScope: f.productScope,
        platformCaps: f.platformCaps,
        durationDays: f.durationDays,
        features: f.features,
        allowAutoRenew: f.allowAutoRenew,
        isActive: f.isActive,
        sortOrder: f.sortOrder,
    }).returning();
    return rows[0];
}

export async function updatePlan(id: number, f: Partial<PlanFields>): Promise<Record<string, unknown> | null> {
    const rows = await db.update(plans).set({
        ...(f.name !== undefined ? { name: f.name } : {}),
        ...(f.description !== undefined ? { description: f.description } : {}),
        ...(f.billingType !== undefined ? { billingType: f.billingType } : {}),
        ...(f.interval !== undefined ? { interval: f.interval } : {}),
        ...(f.priceCents !== undefined ? { priceCents: f.priceCents } : {}),
        ...(f.currency !== undefined ? { currency: f.currency } : {}),
        ...(f.productScope !== undefined ? { productScope: f.productScope } : {}),
        ...(f.platformCaps !== undefined ? { platformCaps: f.platformCaps } : {}),
        ...(f.durationDays !== undefined ? { durationDays: f.durationDays } : {}),
        ...(f.features !== undefined ? { features: f.features } : {}),
        ...(f.allowAutoRenew !== undefined ? { allowAutoRenew: f.allowAutoRenew } : {}),
        ...(f.isActive !== undefined ? { isActive: f.isActive } : {}),
        ...(f.sortOrder !== undefined ? { sortOrder: f.sortOrder } : {}),
        updatedAt: sql`NOW()`,
    }).where(eq(plans.id, id)).returning();
    return rows[0] ?? null;
}

export async function deletePlan(id: number): Promise<boolean> {
    const rows = await db.delete(plans).where(eq(plans.id, id)).returning({ id: plans.id });
    return rows.length > 0;
}
