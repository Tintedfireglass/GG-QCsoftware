import { and, eq, ne, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';

const { users } = schema;

/** Branding columns as stored on a user row (empty string == not set). */
export interface StoredResellerBranding {
    logoUrl: string;
    logoKey: string;
    primaryColor: string;
    /** Host that activates this branding, canonicalised by normalizeHost(). */
    domain: string;
}

/** Identity + branding of a single user, in one round trip. */
export interface UserBrandingRow extends StoredResellerBranding {
    id: number;
    role: string;
    createdBy: number | null;
    companyName: string;
}

const columns = {
    id: users.id,
    role: users.role,
    createdBy: users.createdBy,
    companyName: users.companyName,
    logoUrl: users.brandingLogoUrl,
    logoKey: users.brandingLogoKey,
    primaryColor: users.brandingPrimaryColor,
    domain: users.brandingDomain,
};

function toRow(r: Record<string, unknown> | undefined): UserBrandingRow | null {
    if (!r) return null;
    return {
        id: r.id as number,
        role: (r.role as string) ?? '',
        createdBy: (r.createdBy as number | null) ?? null,
        companyName: (r.companyName as string | null) ?? '',
        logoUrl: (r.logoUrl as string | null) ?? '',
        logoKey: (r.logoKey as string | null) ?? '',
        primaryColor: (r.primaryColor as string | null) ?? '',
        domain: (r.domain as string | null) ?? '',
    };
}

export async function findUserBranding(userId: number): Promise<UserBrandingRow | null> {
    const rows = await db.select(columns).from(users).where(eq(users.id, userId)).limit(1);
    return toRow(rows[0]);
}

/**
 * The reseller that owns `domain`, if any. `domain` must already be normalised —
 * the column stores the canonical form, so this is a plain equality hit on
 * idx_users_branding_domain.
 */
export async function findResellerByDomain(domain: string): Promise<UserBrandingRow | null> {
    const rows = await db
        .select(columns)
        .from(users)
        .where(and(eq(users.brandingDomain, domain), eq(users.role, 'Reseller'), eq(users.isActive, true)))
        .limit(1);
    return toRow(rows[0]);
}

/** True when another user has already claimed `domain`. */
export async function domainTakenByOther(domain: string, exceptUserId: number): Promise<boolean> {
    const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.brandingDomain, domain), ne(users.id, exceptUserId)))
        .limit(1);
    return rows.length > 0;
}

/** Persist a partial branding change. Empty strings clear a slot. */
export async function saveUserBranding(userId: number, patch: Partial<StoredResellerBranding>): Promise<void> {
    const set: Record<string, unknown> = {};
    if (patch.logoUrl !== undefined) set.brandingLogoUrl = patch.logoUrl;
    if (patch.logoKey !== undefined) set.brandingLogoKey = patch.logoKey;
    if (patch.primaryColor !== undefined) set.brandingPrimaryColor = patch.primaryColor;
    // NULL rather than '' when cleared: the unique index treats every NULL as
    // distinct, so any number of resellers can have no domain.
    if (patch.domain !== undefined) set.brandingDomain = patch.domain || sql`NULL`;
    if (Object.keys(set).length === 0) return;
    await db.update(users).set(set).where(eq(users.id, userId));
}
