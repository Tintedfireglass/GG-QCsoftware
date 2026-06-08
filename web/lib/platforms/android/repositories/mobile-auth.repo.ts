import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';

const { otpCodes, customerUsers } = schema;

// ── OTP ─────────────────────────────────────────────────────────────────────────
export async function insertOtp(phone: string, codeHash: string, expiresAt: string): Promise<void> {
    await db.insert(otpCodes).values({ phone, codeHash, expiresAt, purpose: 'login' });
}

export interface OtpRow {
    id: number;
    code_hash: string;
    attempts: number;
    expires_at: string;
    consumed_at: string | null;
}

/** Latest unconsumed OTP for a phone. */
export async function findLatestOtp(phone: string): Promise<OtpRow | null> {
    const rows = await db
        .select({
            id: otpCodes.id,
            code_hash: otpCodes.codeHash,
            attempts: otpCodes.attempts,
            expires_at: otpCodes.expiresAt,
            consumed_at: otpCodes.consumedAt,
        })
        .from(otpCodes)
        .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.consumedAt)))
        .orderBy(desc(otpCodes.createdAt))
        .limit(1);
    return rows[0] ?? null;
}

export async function incrementOtpAttempts(id: number): Promise<void> {
    await db.update(otpCodes).set({ attempts: sql`${otpCodes.attempts} + 1` }).where(eq(otpCodes.id, id));
}

export async function consumeOtp(id: number): Promise<void> {
    await db.update(otpCodes).set({ consumedAt: sql`now()` }).where(eq(otpCodes.id, id));
}

/** Throttle: how many OTPs were issued to this phone in the last `minutes`. */
export async function countRecentOtps(phone: string, minutes: number): Promise<number> {
    const rows = await db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(otpCodes)
        .where(and(eq(otpCodes.phone, phone), sql`${otpCodes.createdAt} > now() - (${minutes} || ' minutes')::interval`));
    return rows[0]?.n ?? 0;
}

// ── Customer identity ─────────────────────────────────────────────────────────────
export interface MobileCustomer {
    id: number;
    email: string | null;
    phone: string | null;
    is_active: boolean;
}

export async function findCustomerByPhone(phone: string): Promise<MobileCustomer | null> {
    const rows = await db
        .select({ id: customerUsers.id, email: customerUsers.email, phone: customerUsers.phone, is_active: customerUsers.isActive })
        .from(customerUsers)
        .where(and(eq(customerUsers.phone, phone), eq(customerUsers.isActive, true)))
        .orderBy(desc(customerUsers.id))
        .limit(1);
    const r = rows[0];
    return r ? { ...r, is_active: r.is_active ?? false } : null;
}

export interface NewMobileCustomer {
    phone: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    dateOfBirth?: string | null; // ISO date (yyyy-mm-dd) or null
    countryCode?: string;
}

export async function createCustomerFromPhone(v: NewMobileCustomer): Promise<MobileCustomer> {
    const fullName = [v.firstName, v.lastName].filter(Boolean).join(' ') || null;
    const rows = await db
        .insert(customerUsers)
        .values({
            phone: v.phone,
            firstName: v.firstName ?? null,
            lastName: v.lastName ?? null,
            fullName,
            email: v.email ?? null,
            dateOfBirth: v.dateOfBirth ?? null,
            countryCode: v.countryCode ?? null,
        })
        .returning({ id: customerUsers.id, email: customerUsers.email, phone: customerUsers.phone, is_active: customerUsers.isActive });
    const r = rows[0];
    return { ...r, is_active: r.is_active ?? false };
}

// ── Profile ───────────────────────────────────────────────────────────────────────
export async function getProfile(customerId: number): Promise<Record<string, unknown> | null> {
    const { rows } = await db.execute(sql`
        SELECT cu.id, cu.first_name, cu.last_name, cu.full_name, cu.email, cu.phone,
               to_char(cu.date_of_birth, 'DD/MM/YYYY') AS date_of_birth,
               cu.country_code, cu.created_at,
               (SELECT COUNT(*)::int FROM mobile_reports mr WHERE mr.customer_user_id = cu.id) AS total_reports
        FROM customer_users cu
        WHERE cu.id = ${customerId} AND cu.is_active = true
        LIMIT 1`);
    return (rows[0] as Record<string, unknown>) ?? null;
}

export interface ProfilePatch {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    dateOfBirth?: string | null; // ISO date
    countryCode?: string;
}

export async function updateProfile(customerId: number, patch: ProfilePatch): Promise<void> {
    const set: Record<string, unknown> = {};
    if (patch.firstName !== undefined) set.firstName = patch.firstName;
    if (patch.lastName !== undefined) set.lastName = patch.lastName;
    if (patch.phone !== undefined) set.phone = patch.phone;
    if (patch.email !== undefined) set.email = patch.email;
    if (patch.dateOfBirth !== undefined) set.dateOfBirth = patch.dateOfBirth;
    if (patch.countryCode !== undefined) set.countryCode = patch.countryCode;
    // Keep full_name in sync when either name part changes.
    if (patch.firstName !== undefined || patch.lastName !== undefined) {
        set.fullName = sql`NULLIF(TRIM(CONCAT_WS(' ',
            COALESCE(${patch.firstName ?? null}, first_name),
            COALESCE(${patch.lastName ?? null}, last_name))), '')`;
    }
    if (Object.keys(set).length === 0) return;
    await db.update(customerUsers).set(set).where(eq(customerUsers.id, customerId));
}

/** Soft-delete: deactivate and free the phone/email so the number can re-register. */
export async function deactivateCustomer(customerId: number): Promise<void> {
    await db
        .update(customerUsers)
        .set({
            isActive: false,
            phone: sql`CONCAT('deleted:', id, ':', COALESCE(phone, ''))`,
            email: sql`CASE WHEN email IS NULL THEN NULL ELSE CONCAT('deleted:', id, ':', email) END`,
        })
        .where(eq(customerUsers.id, customerId));
}
