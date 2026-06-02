import { and, eq, or, sql } from 'drizzle-orm';
import { db, schema, type Tx } from '@/lib/drizzle';

const { users, machines, licenseKeys, licenseKeyActivations, customerUsers, freeTrials, trialEmailBlocks } = schema;

// ── Login / register ──

export interface LoginUserRow {
    id: number;
    username: string;
    role: string;
    password_hash: string;
}

export async function findActiveUserByIdentifier(identifier: string): Promise<LoginUserRow | null> {
    const rows = await db
        .select({ id: users.id, username: users.username, role: users.role, password_hash: users.passwordHash })
        .from(users)
        .where(and(
            or(eq(users.username, identifier), sql`LOWER(${users.email}) = LOWER(${identifier})`),
            eq(users.isActive, true)
        ))
        .limit(1);
    const r = rows[0];
    return r ? { id: r.id, username: r.username, role: r.role ?? '', password_hash: r.password_hash } : null;
}

export async function usernameExists(username: string): Promise<boolean> {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
    return rows.length > 0;
}

export async function insertUser(v: {
    username: string;
    passwordHash: string;
    email: string | null;
    companyName: string | null;
    displayName: string;
    role: string;
    createdBy: number;
}): Promise<Record<string, unknown>> {
    const rows = await db.insert(users).values({
        username: v.username,
        passwordHash: v.passwordHash,
        email: v.email,
        companyName: v.companyName,
        displayName: v.displayName,
        role: v.role,
        createdBy: v.createdBy,
    }).returning({
        id: users.id,
        username: users.username,
        email: users.email,
        company_name: users.companyName,
        display_name: users.displayName,
        role: users.role,
        created_by: users.createdBy,
        is_active: users.isActive,
        created_at: users.createdAt,
    });
    return rows[0];
}

// ── Shared machine resolution (by hardware fingerprint, with legacy serial fallback) ──

export async function findOrCreateMachineByFingerprint(
    tx: Tx,
    fingerprint: string,
    serial: string,
    macAddress?: string,
    computerName?: string
): Promise<number> {
    const byFp = await tx.select({ id: machines.id }).from(machines)
        .where(eq(machines.hardwareFingerprint, fingerprint)).limit(1);
    if (byFp.length) {
        await tx.update(machines).set({ lastSeen: sql`NOW()` }).where(eq(machines.id, byFp[0].id));
        return byFp[0].id;
    }

    const bySerial = await tx.select({ id: machines.id }).from(machines)
        .where(eq(machines.machineId, serial)).limit(1);
    if (bySerial.length) {
        await tx.update(machines).set({
            hardwareFingerprint: fingerprint,
            computerName: computerName ?? null,
            macAddress: macAddress ?? null,
            lastSeen: sql`NOW()`,
        }).where(eq(machines.id, bySerial[0].id));
        return bySerial[0].id;
    }

    const ins = await tx.insert(machines).values({
        machineId: serial,
        serialNumber: serial,
        macAddress: macAddress ?? null,
        computerName: computerName ?? null,
        hardwareFingerprint: fingerprint,
        lastSeen: sql`NOW()`,
    }).returning({ id: machines.id });
    return ins[0].id;
}

// ── License activation ──

export interface LicenseKeyRow {
    id: number;
    is_active: boolean;
    expires_at: string | null;
    type: string;
    demo_runs_used: number;
    demo_max_runs: number | null;
    current_uses: number | null;
    max_uses: number;
    customer_user_id: number | null;
    created_by: number | null;
}

export async function findLicenseKeyByKey(tx: Tx, key: string): Promise<LicenseKeyRow | null> {
    const rows = await tx.select({
        id: licenseKeys.id,
        is_active: licenseKeys.isActive,
        expires_at: licenseKeys.expiresAt,
        type: licenseKeys.type,
        demo_runs_used: licenseKeys.demoRunsUsed,
        demo_max_runs: licenseKeys.demoMaxRuns,
        current_uses: licenseKeys.currentUses,
        max_uses: licenseKeys.maxUses,
        customer_user_id: licenseKeys.customerUserId,
        created_by: licenseKeys.createdBy,
    }).from(licenseKeys).where(eq(licenseKeys.key, key)).limit(1);
    const r = rows[0];
    if (!r) return null;
    return { ...r, is_active: r.is_active ?? false, demo_runs_used: r.demo_runs_used ?? 0 };
}

export async function isMachineActivated(tx: Tx, licenseKeyId: number, machineSerial: string): Promise<boolean> {
    const rows = await tx.select({ id: licenseKeyActivations.id }).from(licenseKeyActivations)
        .where(and(eq(licenseKeyActivations.licenseKeyId, licenseKeyId), eq(licenseKeyActivations.machineSerial, machineSerial)))
        .limit(1);
    return rows.length > 0;
}

export async function insertActivation(tx: Tx, licenseKeyId: number, machineSerial: string): Promise<void> {
    await tx.insert(licenseKeyActivations).values({ licenseKeyId, machineSerial });
}

export async function incrementCurrentUses(tx: Tx, licenseKeyId: number): Promise<void> {
    await tx.update(licenseKeys)
        .set({ currentUses: sql`COALESCE(current_uses, 0) + 1` })
        .where(eq(licenseKeys.id, licenseKeyId));
}

export async function findCustomer(tx: Tx, id: number): Promise<{ id: number; email: string; is_active: boolean } | null> {
    const rows = await tx.select({ id: customerUsers.id, email: customerUsers.email, is_active: customerUsers.isActive })
        .from(customerUsers).where(eq(customerUsers.id, id)).limit(1);
    const r = rows[0];
    return r ? { id: r.id, email: r.email, is_active: r.is_active ?? false } : null;
}

export async function findUserBasicTx(tx: Tx, id: number): Promise<{ id: number; username: string; role: string } | null> {
    const rows = await tx.select({ id: users.id, username: users.username, role: users.role })
        .from(users).where(eq(users.id, id)).limit(1);
    const r = rows[0];
    return r ? { id: r.id, username: r.username, role: r.role ?? '' } : null;
}

// ── Free trial ──

export interface TrialRow {
    id: number;
    email: string;
    trial_end_utc: string;
    is_active: boolean;
    machine_id: number | null;
}

export async function findTrialByFingerprint(tx: Tx, fingerprint: string): Promise<TrialRow | null> {
    const rows = await tx.select({
        id: freeTrials.id,
        email: freeTrials.email,
        trial_end_utc: freeTrials.trialEndUtc,
        is_active: freeTrials.isActive,
        machine_id: freeTrials.machineId,
    }).from(freeTrials).where(eq(freeTrials.machineFingerprint, fingerprint)).limit(1);
    const r = rows[0];
    return r ? { ...r, is_active: r.is_active ?? false } : null;
}

export async function isEmailBlocked(tx: Tx, normalizedEmail: string): Promise<boolean> {
    const rows = await tx.select({ id: trialEmailBlocks.id }).from(trialEmailBlocks)
        .where(sql`LOWER(${trialEmailBlocks.email}) = ${normalizedEmail}`).limit(1);
    return rows.length > 0;
}

export async function insertTrial(tx: Tx, v: {
    email: string;
    fingerprint: string;
    machineSerial: string;
    macAddress: string | null;
    computerName: string | null;
    machineId: number;
}): Promise<{ id: number; trial_end_utc: string }> {
    const rows = await tx.insert(freeTrials).values({
        email: v.email,
        machineFingerprint: v.fingerprint,
        machineSerial: v.machineSerial,
        macAddress: v.macAddress,
        computerName: v.computerName,
        machineId: v.machineId,
        trialEndUtc: sql`NOW() + INTERVAL '7 days'`,
    }).returning({ id: freeTrials.id, trial_end_utc: freeTrials.trialEndUtc });
    return rows[0];
}

export async function blockEmail(tx: Tx, email: string, trialId: number): Promise<void> {
    await tx.insert(trialEmailBlocks).values({ email, trialId });
}
