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
    // Phone-only app users have no password — they can't log in via email+password.
    if (!r || !r.password_hash) return null;
    return { id: r.id, email: r.email ?? email, password_hash: r.password_hash, full_name: r.full_name, is_active: r.is_active ?? false };
}

/** Look up a customer by email regardless of active state (for guest checkout). */
export async function findCustomerByEmailAny(email: string): Promise<{ id: number; full_name: string | null } | null> {
    const rows = await db.select({ id: customerUsers.id, full_name: customerUsers.fullName })
        .from(customerUsers).where(eq(customerUsers.email, email)).limit(1);
    return rows[0] ?? null;
}

// ── Admin: customer directory (SuperAdmin) ──

function buildCustomerWhere(p: { status?: string; type?: string; search?: string }) {
    const conds = [];
    if (p.status === 'active') conds.push(sql`cu.is_active IS TRUE`);
    else if (p.status === 'inactive') conds.push(sql`cu.is_active IS NOT TRUE`);
    if (p.type === 'web') conds.push(sql`cu.password_hash IS NOT NULL`);
    else if (p.type === 'app') conds.push(sql`cu.password_hash IS NULL`);
    if (p.search) {
        const like = `%${p.search}%`;
        conds.push(sql`(cu.email ILIKE ${like} OR cu.full_name ILIKE ${like} OR cu.phone ILIKE ${like} OR cu.company ILIKE ${like})`);
    }
    return conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
}

export async function listCustomersAdmin(p: { status?: string; type?: string; search?: string; limit: number; offset: number }): Promise<Record<string, unknown>[]> {
    const where = buildCustomerWhere(p);
    const { rows } = await db.execute(sql`
        SELECT cu.id, cu.email, cu.full_name, cu.company, cu.phone, cu.country_code,
               cu.is_active, cu.created_at,
               (cu.password_hash IS NOT NULL) AS has_password,
               COUNT(DISTINCT co.id)::int AS order_count,
               COUNT(DISTINCT lk.id)::int AS license_count
        FROM customer_users cu
        LEFT JOIN customer_orders co ON co.customer_user_id = cu.id
        LEFT JOIN license_keys lk ON lk.customer_user_id = cu.id
        ${where}
        GROUP BY cu.id
        ORDER BY cu.created_at DESC
        LIMIT ${p.limit} OFFSET ${p.offset}`);
    return rows as Record<string, unknown>[];
}

export async function countCustomersAdmin(p: { status?: string; type?: string; search?: string }): Promise<number> {
    const where = buildCustomerWhere(p);
    const { rows } = await db.execute(sql`SELECT COUNT(*)::int AS n FROM customer_users cu ${where}`);
    return (rows[0]?.n as number) ?? 0;
}

export async function getCustomerDetailAdmin(id: number): Promise<Record<string, unknown> | null> {
    const { rows } = await db.execute(sql`
        SELECT cu.id, cu.email, cu.full_name, cu.company, cu.phone,
               cu.first_name, cu.last_name, cu.date_of_birth, cu.country_code,
               cu.is_active, cu.created_at,
               (cu.password_hash IS NOT NULL) AS has_password,
               (SELECT COUNT(*)::int FROM customer_orders co WHERE co.customer_user_id = cu.id) AS order_count,
               (SELECT COUNT(*)::int FROM license_keys lk WHERE lk.customer_user_id = cu.id) AS license_count
        FROM customer_users cu
        WHERE cu.id = ${id}
        LIMIT 1`);
    return (rows[0] as Record<string, unknown>) ?? null;
}

export async function listCustomerOrdersAdmin(id: number): Promise<Record<string, unknown>[]> {
    const { rows } = await db.execute(sql`
        SELECT co.id, co.plan, co.amount_cents, co.currency, co.status,
               co.created_at, p.name AS plan_name, lk.key AS license_key
        FROM customer_orders co
        LEFT JOIN plans p ON p.id = co.plan_id
        LEFT JOIN license_keys lk ON lk.id = co.generated_license_key_id
        WHERE co.customer_user_id = ${id}
        ORDER BY co.created_at DESC`);
    return rows as Record<string, unknown>[];
}

export async function listCustomerTicketsAdmin(id: number): Promise<Record<string, unknown>[]> {
    const { rows } = await db.execute(sql`
        SELECT id, ticket_id, subject, category, status, priority, created_at
        FROM support_tickets
        WHERE customer_user_id = ${id}
        ORDER BY created_at DESC`);
    return rows as Record<string, unknown>[];
}

export async function setCustomerActive(id: number, isActive: boolean): Promise<boolean> {
    const rows = await db.update(customerUsers).set({ isActive })
        .where(eq(customerUsers.id, id)).returning({ id: customerUsers.id });
    return rows.length > 0;
}

/** Apply a partial admin edit. Only the keys present in `patch` are written. */
export async function updateCustomerAdmin(id: number, patch: {
    fullName?: string | null;
    company?: string | null;
    phone?: string | null;
    email?: string | null;
    isActive?: boolean;
}): Promise<boolean> {
    const set: Record<string, unknown> = {};
    if ('fullName' in patch) set.fullName = patch.fullName ?? null;
    if ('company' in patch) set.company = patch.company ?? null;
    if ('phone' in patch) set.phone = patch.phone ?? null;
    if ('email' in patch) set.email = patch.email ?? null;
    if ('isActive' in patch) set.isActive = patch.isActive;
    if (Object.keys(set).length === 0) return true;
    const rows = await db.update(customerUsers).set(set)
        .where(eq(customerUsers.id, id)).returning({ id: customerUsers.id });
    return rows.length > 0;
}

/** True if an email already belongs to a *different* customer (for edit uniqueness). */
export async function emailTakenByOther(email: string, excludeId: number): Promise<boolean> {
    const rows = await db.select({ id: customerUsers.id }).from(customerUsers)
        .where(and(eq(customerUsers.email, email), sql`${customerUsers.id} <> ${excludeId}`)).limit(1);
    return rows.length > 0;
}

/**
 * Hard-delete a customer and all of their dependent records in one transaction.
 * customer_users has no DB-level FKs, so every child table is cleaned up explicitly.
 * visitor_sessions are kept for analytics — only their customer link is nulled.
 */
export async function deleteCustomerCascade(id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
        const exists = await tx.select({ id: customerUsers.id }).from(customerUsers)
            .where(eq(customerUsers.id, id)).limit(1);
        if (exists.length === 0) return false;

        await tx.execute(sql`DELETE FROM support_ticket_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE customer_user_id = ${id})`);
        await tx.execute(sql`DELETE FROM support_tickets WHERE customer_user_id = ${id}`);
        await tx.execute(sql`DELETE FROM coupon_redemptions WHERE customer_user_id = ${id}`);
        await tx.execute(sql`DELETE FROM mobile_reports WHERE customer_user_id = ${id}`);
        await tx.execute(sql`DELETE FROM mobile_devices WHERE customer_user_id = ${id}`);
        await tx.execute(sql`DELETE FROM customer_orders WHERE customer_user_id = ${id}`);
        await tx.execute(sql`DELETE FROM license_keys WHERE customer_user_id = ${id}`);
        await tx.execute(sql`UPDATE visitor_sessions SET customer_user_id = NULL WHERE customer_user_id = ${id}`);
        await tx.execute(sql`DELETE FROM customer_users WHERE id = ${id}`);
        return true;
    });
}

export async function customerEmailExists(email: string): Promise<boolean> {
    const rows = await db.select({ id: customerUsers.id }).from(customerUsers).where(eq(customerUsers.email, email)).limit(1);
    return rows.length > 0;
}

export async function insertCustomer(
    email: string,
    passwordHash: string,
    fullName: string | null,
    company?: string | null,
    phone?: string | null,
): Promise<{ id: number; email: string; full_name: string | null }> {
    const rows = await db.insert(customerUsers).values({ email, passwordHash, fullName, company: company ?? null, phone: phone ?? null })
        .returning({ id: customerUsers.id, email: customerUsers.email, full_name: customerUsers.fullName });
    return { id: rows[0].id, email: rows[0].email ?? email, full_name: rows[0].full_name };
}

/** Fill in company/phone for an existing customer only where currently empty. */
export async function updateCustomerContact(id: number, company: string | null, phone: string | null): Promise<void> {
    if (!company && !phone) return;
    await db.update(customerUsers).set({
        ...(company ? { company: sql`COALESCE(${customerUsers.company}, ${company})` } : {}),
        ...(phone ? { phone: sql`COALESCE(${customerUsers.phone}, ${phone})` } : {}),
    }).where(eq(customerUsers.id, id));
}

export async function findCustomerProfile(customerId: number): Promise<{ id: number; email: string; full_name: string | null } | null> {
    const rows = await db.select({ id: customerUsers.id, email: customerUsers.email, full_name: customerUsers.fullName })
        .from(customerUsers).where(and(eq(customerUsers.id, customerId), eq(customerUsers.isActive, true))).limit(1);
    const r = rows[0];
    return r ? { id: r.id, email: r.email ?? '', full_name: r.full_name } : null;
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
    planId: number | null;
    amountCents: number;
    currency: string;
    checkoutState: string;
    autoRenew?: boolean;
    isRenewal?: boolean;
    status?: string;
    subtotalCents?: number;
    discountCents?: number;
    couponId?: number | null;
    quantity?: number;
    pendingPassword?: string | null;
}): Promise<number> {
    const rows = await db.insert(customerOrders).values({
        customerUserId: v.customerId,
        plan: v.plan,
        planId: v.planId,
        amountCents: v.amountCents,
        currency: v.currency,
        status: v.status ?? 'pending',
        checkoutState: v.checkoutState,
        autoRenew: v.autoRenew ?? false,
        isRenewal: v.isRenewal ?? false,
        subtotalCents: v.subtotalCents ?? v.amountCents,
        discountCents: v.discountCents ?? 0,
        couponId: v.couponId ?? null,
        quantity: v.quantity ?? 1,
        pendingPassword: v.pendingPassword ?? null,
    }).returning({ id: customerOrders.id });
    return rows[0].id;
}

/** Recipient + content for the post-purchase confirmation email. */
export interface OrderEmailInfo {
    email: string;
    full_name: string | null;
    plan_name: string | null;
    pending_password: string | null;
}

export async function getOrderEmailInfo(orderId: number): Promise<OrderEmailInfo | null> {
    const { rows } = await db.execute(sql`
        SELECT cu.email, cu.full_name, co.plan AS plan_name, co.pending_password
        FROM customer_orders co
        JOIN customer_users cu ON cu.id = co.customer_user_id
        WHERE co.id = ${orderId}
        LIMIT 1`);
    return (rows[0] as unknown as OrderEmailInfo) ?? null;
}

/** Clear the transient generated password once it has been emailed. */
export async function clearPendingPassword(orderId: number): Promise<void> {
    await db.update(customerOrders).set({ pendingPassword: null }).where(eq(customerOrders.id, orderId));
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
    plan_id: number | null;
    auto_renew: boolean;
    coupon_id: number | null;
    discount_cents: number;
    quantity: number;
}

export async function findOrder(tx: Tx, orderId: number, customerId: number): Promise<OrderRow | null> {
    const rows = await tx.select({
        status: customerOrders.status,
        generated_license_key_id: customerOrders.generatedLicenseKeyId,
        plan_id: customerOrders.planId,
        auto_renew: customerOrders.autoRenew,
        coupon_id: customerOrders.couponId,
        discount_cents: customerOrders.discountCents,
        quantity: customerOrders.quantity,
    })
        .from(customerOrders)
        .where(and(eq(customerOrders.id, orderId), eq(customerOrders.customerUserId, customerId)))
        .limit(1);
    const r = rows[0];
    return r ? { ...r, auto_renew: r.auto_renew ?? false, discount_cents: r.discount_cents ?? 0, quantity: r.quantity ?? 1 } : null;
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

export interface CustomerKeyEntitlement {
    type: string;
    maxUses: number;
    productScope: string[];
    platformCaps: Record<string, number>;
    expiry: Date | null;
    autoRenew?: boolean;
    renewalPlanId?: number | null;
}

export async function insertCustomerLicenseKey(tx: Tx, key: string, customerId: number, e: CustomerKeyEntitlement): Promise<number> {
    const rows = await tx.insert(licenseKeys).values({
        key,
        type: e.type,
        maxUses: e.maxUses,
        currentUses: 0,
        customerUserId: customerId,
        isActive: true,
        expiresAt: e.expiry ? e.expiry.toISOString() : null,
        createdBy: null,
        productScope: e.productScope,
        platformCaps: e.platformCaps,
        autoRenew: e.autoRenew ?? false,
        renewalPlanId: e.renewalPlanId ?? null,
    }).returning({ id: licenseKeys.id });
    return rows[0].id;
}

/** Persist the saved mandate (customer + token) on a key after first payment. */
export async function setKeyRenewalToken(keyId: number, customerRef: string, tokenRef: string): Promise<void> {
    await db.update(licenseKeys)
        .set({ gatewayCustomerRef: customerRef, gatewayTokenRef: tokenRef })
        .where(eq(licenseKeys.id, keyId));
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

// ── Refund (admin) ──

export interface RefundOrderRow {
    id: number;
    status: string;
    gateway_reference: string | null;
    amount_cents: number;
    generated_license_key_id: number | null;
}

export async function findOrderById(orderId: number): Promise<RefundOrderRow | null> {
    const rows = await db.select({
        id: customerOrders.id,
        status: customerOrders.status,
        gateway_reference: customerOrders.gatewayReference,
        amount_cents: customerOrders.amountCents,
        generated_license_key_id: customerOrders.generatedLicenseKeyId,
    }).from(customerOrders).where(eq(customerOrders.id, orderId)).limit(1);
    return rows[0] ?? null;
}

/** Mark an order refunded and deactivate its generated license key, atomically. */
export async function markOrderRefunded(orderId: number, licenseKeyId: number | null): Promise<void> {
    await db.transaction(async (tx) => {
        await tx.update(customerOrders).set({
            status: 'refunded',
            updatedAt: sql`NOW()`,
        }).where(eq(customerOrders.id, orderId));
        if (licenseKeyId) {
            await tx.update(licenseKeys).set({ isActive: false }).where(eq(licenseKeys.id, licenseKeyId));
        }
    });
}
