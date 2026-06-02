import { and, eq, sql } from 'drizzle-orm';
import { db, schema, type Tx } from '@/lib/drizzle';
import { generateRandomLicenseKey } from '@/lib/license-key';

const { customerUsers, customerOrders, licenseKeys } = schema;

export interface CustomerCredentialsRow {
    id: number;
    email: string;
    password_hash: string;
    full_name: string | null;
    is_active: boolean;
}

export async function findActiveCustomerByEmail(email: string): Promise<CustomerCredentialsRow | null> {
    const rows = await db.select({
        id: customerUsers.id,
        email: customerUsers.email,
        password_hash: customerUsers.passwordHash,
        full_name: customerUsers.fullName,
        is_active: customerUsers.isActive,
    }).from(customerUsers).where(and(eq(customerUsers.email, email), eq(customerUsers.isActive, true))).limit(1);
    const r = rows[0];
    return r ? { ...r, is_active: r.is_active ?? false } : null;
}

export async function customerEmailExists(email: string): Promise<boolean> {
    const rows = await db.select({ id: customerUsers.id }).from(customerUsers).where(eq(customerUsers.email, email)).limit(1);
    return rows.length > 0;
}

export async function insertCustomer(email: string, passwordHash: string, fullName: string | null): Promise<{ id: number; email: string; full_name: string | null }> {
    const rows = await db.insert(customerUsers).values({ email, passwordHash, fullName })
        .returning({ id: customerUsers.id, email: customerUsers.email, full_name: customerUsers.fullName });
    return rows[0];
}

export async function findCustomerProfile(customerId: number): Promise<{ id: number; email: string; full_name: string | null } | null> {
    const rows = await db.select({ id: customerUsers.id, email: customerUsers.email, full_name: customerUsers.fullName })
        .from(customerUsers).where(and(eq(customerUsers.id, customerId), eq(customerUsers.isActive, true))).limit(1);
    return rows[0] ?? null;
}

export async function listCustomerLicenses(customerId: number): Promise<Record<string, unknown>[]> {
    const { rows } = await db.execute(sql`
        SELECT lk.id, lk.key, lk.is_active, lk.expires_at, lk.created_at, co.plan, co.payment_reference
        FROM license_keys lk
        LEFT JOIN customer_orders co ON co.generated_license_key_id = lk.id
        WHERE lk.customer_user_id = ${customerId}
        ORDER BY lk.created_at DESC`);
    return rows as Record<string, unknown>[];
}

export async function createOrder(v: {
    customerId: number;
    plan: string;
    amountCents: number;
    currency: string;
    checkoutState: string;
}): Promise<number> {
    const rows = await db.insert(customerOrders).values({
        customerUserId: v.customerId,
        plan: v.plan,
        amountCents: v.amountCents,
        currency: v.currency,
        status: 'pending',
        checkoutState: v.checkoutState,
    }).returning({ id: customerOrders.id });
    return rows[0].id;
}

export async function updateOrderCheckoutState(orderId: number, state: string): Promise<void> {
    await db.update(customerOrders)
        .set({ checkoutState: state, updatedAt: sql`NOW()` })
        .where(eq(customerOrders.id, orderId));
}

// ── Payment callback (transactional) ──

export interface OrderRow {
    status: string;
    generated_license_key_id: number | null;
}

export async function findOrder(tx: Tx, orderId: number, customerId: number): Promise<OrderRow | null> {
    const rows = await tx.select({ status: customerOrders.status, generated_license_key_id: customerOrders.generatedLicenseKeyId })
        .from(customerOrders)
        .where(and(eq(customerOrders.id, orderId), eq(customerOrders.customerUserId, customerId)))
        .limit(1);
    return rows[0] ?? null;
}

export async function findLicenseKeyById(tx: Tx, id: number): Promise<string | null> {
    const rows = await tx.select({ key: licenseKeys.key }).from(licenseKeys).where(eq(licenseKeys.id, id)).limit(1);
    return rows[0]?.key ?? null;
}

export async function markOrderFailed(tx: Tx, orderId: number, paymentRef: string | null, gatewayRef: string | null): Promise<void> {
    await tx.update(customerOrders).set({
        status: 'failed',
        paymentReference: sql`COALESCE(${paymentRef}::varchar, payment_reference)`,
        gatewayReference: sql`COALESCE(${gatewayRef}::varchar, gateway_reference)`,
        updatedAt: sql`NOW()`,
    }).where(eq(customerOrders.id, orderId));
}

export async function generateUniqueKey(tx: Tx): Promise<string> {
    for (let i = 0; i < 10; i++) {
        const key = generateRandomLicenseKey();
        const exists = await tx.select({ id: licenseKeys.id }).from(licenseKeys).where(eq(licenseKeys.key, key)).limit(1);
        if (exists.length === 0) return key;
    }
    throw new Error('Failed to generate unique license key');
}

export async function insertCustomerLicenseKey(tx: Tx, key: string, customerId: number, expiry: Date | null): Promise<number> {
    const rows = await tx.insert(licenseKeys).values({
        key,
        type: 'single_use',
        maxUses: 1,
        currentUses: 0,
        customerUserId: customerId,
        isActive: true,
        expiresAt: expiry ? expiry.toISOString() : null,
        createdBy: null,
    }).returning({ id: licenseKeys.id });
    return rows[0].id;
}

export async function markOrderPaid(tx: Tx, orderId: number, paymentRef: string | null, gatewayRef: string | null, licenseKeyId: number): Promise<void> {
    await tx.update(customerOrders).set({
        status: 'paid',
        paymentReference: sql`COALESCE(${paymentRef}::varchar, payment_reference)`,
        gatewayReference: sql`COALESCE(${gatewayRef}::varchar, gateway_reference)`,
        generatedLicenseKeyId: licenseKeyId,
        updatedAt: sql`NOW()`,
    }).where(eq(customerOrders.id, orderId));
}
