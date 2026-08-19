import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';
import { UserRole } from '@/lib/types';
import type { PartnerScope } from './scopes';

const { partnerApiKeys, users } = schema;

/** Key metadata safe to return to an admin — never includes the hash. */
export interface PartnerKeyRow {
    id: number;
    userId: number;
    name: string;
    keyPrefix: string;
    scopes: PartnerScope[];
    rateLimitPerMin: number;
    allowedOrigins: string[];
    isActive: boolean;
    expiresAt: string | null;
    lastUsedAt: string | null;
    revokedAt: string | null;
    createdAt: string | null;
}

/** A live key plus the identity it authenticates as, in one round trip. */
export interface ResolvedPartnerKey {
    keyId: number;
    scopes: PartnerScope[];
    rateLimitPerMin: number;
    allowedOrigins: string[];
    user: { id: number; username: string; role: UserRole; createdBy: number | null };
}

const meta = {
    id: partnerApiKeys.id,
    userId: partnerApiKeys.userId,
    name: partnerApiKeys.name,
    keyPrefix: partnerApiKeys.keyPrefix,
    scopes: partnerApiKeys.scopes,
    rateLimitPerMin: partnerApiKeys.rateLimitPerMin,
    allowedOrigins: partnerApiKeys.allowedOrigins,
    isActive: partnerApiKeys.isActive,
    expiresAt: partnerApiKeys.expiresAt,
    lastUsedAt: partnerApiKeys.lastUsedAt,
    revokedAt: partnerApiKeys.revokedAt,
    createdAt: partnerApiKeys.createdAt,
};

/** Usable right now: active, not revoked, not past its expiry. */
const live = and(
    eq(partnerApiKeys.isActive, true),
    isNull(partnerApiKeys.revokedAt),
    or(isNull(partnerApiKeys.expiresAt), sql`${partnerApiKeys.expiresAt} > now()`)
);

/**
 * Resolve a presented key hash to its owner. Returns null for an unknown,
 * revoked, expired or deactivated-owner key — the caller cannot tell which,
 * by design.
 */
export async function findLiveByHash(keyHash: string): Promise<ResolvedPartnerKey | null> {
    const rows = await db
        .select({
            keyId: partnerApiKeys.id,
            scopes: partnerApiKeys.scopes,
            rateLimitPerMin: partnerApiKeys.rateLimitPerMin,
            allowedOrigins: partnerApiKeys.allowedOrigins,
            userId: users.id,
            username: users.username,
            role: users.role,
            createdBy: users.createdBy,
        })
        .from(partnerApiKeys)
        .innerJoin(users, eq(users.id, partnerApiKeys.userId))
        .where(and(eq(partnerApiKeys.keyHash, keyHash), live, eq(users.isActive, true)))
        .limit(1);

    const r = rows[0];
    if (!r) return null;
    return {
        keyId: r.keyId,
        scopes: (r.scopes ?? []) as PartnerScope[],
        rateLimitPerMin: r.rateLimitPerMin,
        allowedOrigins: r.allowedOrigins ?? [],
        user: {
            id: r.userId,
            username: r.username,
            role: r.role as UserRole,
            createdBy: r.createdBy ?? null,
        },
    };
}

export async function listByUser(userId: number): Promise<PartnerKeyRow[]> {
    const rows = await db
        .select(meta)
        .from(partnerApiKeys)
        .where(eq(partnerApiKeys.userId, userId))
        .orderBy(desc(partnerApiKeys.createdAt));
    return rows as PartnerKeyRow[];
}

export async function findById(id: number): Promise<PartnerKeyRow | null> {
    const rows = await db.select(meta).from(partnerApiKeys).where(eq(partnerApiKeys.id, id)).limit(1);
    return (rows[0] as PartnerKeyRow) ?? null;
}

export interface InsertPartnerKey {
    userId: number;
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopes: PartnerScope[];
    rateLimitPerMin: number;
    allowedOrigins: string[];
    expiresAt: string | null;
    createdBy: number;
}

export async function insert(input: InsertPartnerKey): Promise<PartnerKeyRow> {
    const rows = await db.insert(partnerApiKeys).values(input).returning(meta);
    return rows[0] as PartnerKeyRow;
}

/** Irreversible: a revoked key is never reactivated, a new one is issued instead. */
export async function revoke(id: number): Promise<void> {
    await db
        .update(partnerApiKeys)
        .set({ isActive: false, revokedAt: sql`now()` })
        .where(eq(partnerApiKeys.id, id));
}

/** Fire-and-forget last-use stamp; failures are not worth failing a request over. */
export async function touchLastUsed(id: number): Promise<void> {
    await db.update(partnerApiKeys).set({ lastUsedAt: sql`now()` }).where(eq(partnerApiKeys.id, id));
}

export async function countActiveForUser(userId: number): Promise<number> {
    const rows = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(partnerApiKeys)
        .where(and(eq(partnerApiKeys.userId, userId), live));
    return rows[0]?.n ?? 0;
}

/**
 * Every origin registered across live keys — the allow-list the CORS preflight
 * is answered from, since a preflight carries no key to look up.
 */
export async function listAllowedOrigins(): Promise<string[]> {
    const rows = await db
        .select({ origin: sql<string>`DISTINCT unnest(${partnerApiKeys.allowedOrigins})` })
        .from(partnerApiKeys)
        .where(live);
    return rows.map((r) => r.origin);
}
