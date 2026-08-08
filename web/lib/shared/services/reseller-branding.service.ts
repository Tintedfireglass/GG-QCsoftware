import { AuthenticatedUser, canManageUser } from '@/lib/auth-middleware';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/http/errors';
import { UserRole } from '@/lib/types';
import {
    DEFAULT_PRIMARY_COLOR,
    hoverColorFor,
    normalizeHexColor,
} from '@/lib/shared/branding-color';
import { normalizeAssignableDomain, normalizeHost } from '@/lib/shared/branding-host';
import { getBranding, type Branding } from '@/lib/shared/services/branding.service';
import * as repo from '@/lib/shared/repositories/reseller-branding.repo';

/**
 * Per-reseller white-label branding, selected by the host the request arrived on.
 *
 * A Reseller row may carry its own wordmark, primary colour and one assigned
 * domain. The branding applies on that domain and nowhere else: every other
 * host — the platform's own dashboard included — always renders the default
 * Pramaan branding, whoever is signed in and whoever issued the certificate
 * being viewed. That makes the rule easy to reason about and impossible for one
 * reseller's theme to leak into another's, since the host is fixed before any
 * session exists.
 *
 * Only the logo, favicon and colour are per-reseller. The product name, login
 * artwork and certificate URLs stay platform-wide.
 */

/** What an admin edits on a reseller, and what the edit form reads back. */
export interface ResellerBrandingSettings {
    /** Uploaded wordmark, or '' when the reseller inherits the platform logo. */
    logoUrl: string;
    /** Uploaded tab icon, or '' when the reseller inherits the platform favicon. */
    faviconUrl: string;
    /** Chosen primary colour as `#rrggbb`; defaults to the platform purple. */
    primaryColor: string;
    /** True when a colour was explicitly chosen (vs. falling back to default). */
    hasCustomColor: boolean;
    /** Host this branding applies on, or '' when it applies nowhere. */
    domain: string;
}

// Resolved on every page render but changed only when an admin saves, so a short
// process-local TTL keeps the lookup off the hot path — the same shape the
// platform branding cache uses.
const TTL_MS = 60_000;

/**
 * Misses are cached too, so the platform's own host does not hit the database on
 * every render. That makes the key space the set of Host headers we are sent
 * rather than the set of domains we assigned — i.e. attacker-controlled — so the
 * map is bounded. Real deployments have a handful of hosts; the cap only ever
 * bites on junk traffic, where dropping the cache costs one query per host.
 */
const MAX_ENTRIES = 500;
const byDomain = new Map<string, { value: repo.UserBrandingRow | null; expiresAt: number }>();

/** Drop cached lookups after a write so the change shows up immediately. */
export function invalidateResellerBrandingCache(): void {
    byDomain.clear();
}

function remember(domain: string, value: repo.UserBrandingRow | null, now: number): void {
    if (byDomain.size >= MAX_ENTRIES) {
        for (const [key, entry] of byDomain) {
            if (entry.expiresAt <= now) byDomain.delete(key);
        }
        // Still full: every entry is live, so this is a flood of distinct hosts
        // rather than a real working set. Start over rather than grow.
        if (byDomain.size >= MAX_ENTRIES) byDomain.clear();
    }
    byDomain.set(domain, { value, expiresAt: now + TTL_MS });
}

async function loadByDomain(domain: string): Promise<repo.UserBrandingRow | null> {
    const now = Date.now();
    const hit = byDomain.get(domain);
    if (hit && hit.expiresAt > now) return hit.value;
    const value = await repo.findResellerByDomain(domain);
    remember(domain, value, now);
    return value;
}

/** Overlay a reseller's logo/favicon/colour onto the platform branding. */
function applyOverrides(base: Branding, owner: repo.UserBrandingRow | null): Branding {
    if (!owner) return base;
    const color = normalizeHexColor(owner.primaryColor) ?? base.primaryColor;
    if (!owner.logoUrl && !owner.faviconUrl && color === base.primaryColor) return base;
    return {
        ...base,
        logoUrl: owner.logoUrl || base.logoUrl,
        faviconUrl: owner.faviconUrl || base.faviconUrl,
        primaryColor: color,
        primaryColorHover: hoverColorFor(color),
        resellerId: owner.id,
    };
}

/**
 * Branding for a request, chosen by its host.
 *
 * Never throws — a database hiccup falls back to the platform branding rather
 * than blanking the product name on every page.
 */
export async function getBrandingForHost(host: string | null | undefined): Promise<Branding> {
    const base = await getBranding();
    const normalized = normalizeHost(host);
    if (!normalized) return base;
    try {
        return applyOverrides(base, await loadByDomain(normalized));
    } catch (err) {
        // Falling back keeps every page rendering, but silence would hide a
        // reseller's branding disappearing entirely — an unapplied migration
        // looks exactly like "no reseller assigned to this host" from outside.
        console.error('[branding] reseller lookup failed for host', normalized, '— using platform branding:', err);
        return base;
    }
}

/** Loads the target reseller, enforcing "is a reseller" + manager authorization. */
async function loadManageableReseller(
    authUser: AuthenticatedUser,
    targetId: number
): Promise<repo.UserBrandingRow> {
    const target = await repo.findUserBranding(targetId);
    if (!target) throw new NotFoundError('User not found');
    if (target.role !== 'Reseller') {
        throw new ValidationError('Branding can only be configured for Reseller accounts');
    }
    if (!canManageUser(authUser, targetId, target.createdBy ?? undefined, target.role as UserRole)) {
        throw new ForbiddenError('You cannot modify this user');
    }
    return target;
}

function toSettings(row: repo.UserBrandingRow): ResellerBrandingSettings {
    const color = normalizeHexColor(row.primaryColor);
    return {
        logoUrl: row.logoUrl,
        faviconUrl: row.faviconUrl,
        primaryColor: color ?? DEFAULT_PRIMARY_COLOR,
        hasCustomColor: color != null,
        domain: row.domain,
    };
}

/** Current branding of a reseller, for the admin edit form. */
export async function getResellerBranding(
    authUser: AuthenticatedUser,
    targetId: number
): Promise<ResellerBrandingSettings> {
    return toSettings(await loadManageableReseller(authUser, targetId));
}

/**
 * Validates a domain an admin assigned. Rejects a host that is not routable to a
 * reseller (bare `localhost`, an IP, a single label), the platform's own host —
 * which would repaint the main dashboard — and one already claimed elsewhere.
 */
async function validateDomain(input: string, targetId: number): Promise<string> {
    const domain = normalizeAssignableDomain(input);
    if (!domain) {
        throw new ValidationError('Enter a domain like qc.acme.com — no scheme, port or path');
    }
    const platformHost = normalizeHost(process.env.NEXT_PUBLIC_APP_URL);
    if (platformHost && domain === platformHost) {
        throw new ValidationError('That is the platform’s own domain — choose a domain that points at this deployment for the reseller');
    }
    if (await repo.domainTakenByOther(domain, targetId)) {
        throw new ConflictError('That domain is already assigned to another reseller');
    }
    return domain;
}

/**
 * Sets a reseller's primary colour and/or domain. Passing '' for either clears
 * it back to the platform default / to no domain.
 */
export async function setResellerFields(
    authUser: AuthenticatedUser,
    targetId: number,
    fields: { color?: string | null; domain?: string | null }
): Promise<ResellerBrandingSettings> {
    const target = await loadManageableReseller(authUser, targetId);
    const patch: Partial<repo.StoredResellerBranding> = {};

    if (fields.color !== undefined) {
        let next = '';
        if (fields.color !== null && fields.color !== '') {
            const normalized = normalizeHexColor(fields.color);
            if (!normalized) throw new ValidationError('Primary colour must be a hex value like #8B3D88');
            next = normalized;
        }
        if (next !== target.primaryColor) patch.primaryColor = next;
    }

    if (fields.domain !== undefined) {
        const next = fields.domain === null || fields.domain === ''
            ? ''
            : await validateDomain(fields.domain, targetId);
        if (next !== target.domain) patch.domain = next;
    }

    if (Object.keys(patch).length > 0) {
        await repo.saveUserBranding(targetId, patch);
        invalidateResellerBrandingCache();
    }
    return toSettings({ ...target, ...patch });
}

/** The uploadable artwork slots on a reseller, and the columns behind each. */
export const RESELLER_ASSETS = {
    logo: { url: 'logoUrl', key: 'logoKey' },
    favicon: { url: 'faviconUrl', key: 'faviconKey' },
} as const;

export type ResellerAsset = keyof typeof RESELLER_ASSETS;

/**
 * Points a reseller at a freshly uploaded logo or favicon. Returns the previous
 * object key so the route can delete it only after the new one is committed.
 */
export async function setResellerAsset(
    authUser: AuthenticatedUser,
    targetId: number,
    asset: ResellerAsset,
    file: { url: string; key: string }
): Promise<{ settings: ResellerBrandingSettings; previousKey: string }> {
    const target = await loadManageableReseller(authUser, targetId);
    const fields = RESELLER_ASSETS[asset];
    const patch = { [fields.url]: file.url, [fields.key]: file.key };
    await repo.saveUserBranding(targetId, patch);
    invalidateResellerBrandingCache();
    const previousKey = target[fields.key];
    return {
        settings: toSettings({ ...target, ...patch }),
        previousKey: previousKey && previousKey !== file.key ? previousKey : '',
    };
}

/**
 * Reverts a reseller to the platform artwork and colour, and releases its
 * domain. Returns every object key it dropped so the route can delete them.
 */
export async function clearResellerBranding(
    authUser: AuthenticatedUser,
    targetId: number
): Promise<{ settings: ResellerBrandingSettings; previousKeys: string[] }> {
    const target = await loadManageableReseller(authUser, targetId);
    const cleared = {
        logoUrl: '', logoKey: '', faviconUrl: '', faviconKey: '', primaryColor: '', domain: '',
    };
    await repo.saveUserBranding(targetId, cleared);
    invalidateResellerBrandingCache();
    return {
        settings: toSettings({ ...target, ...cleared }),
        previousKeys: [target.logoKey, target.faviconKey].filter(Boolean),
    };
}
