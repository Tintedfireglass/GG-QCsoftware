import { getGeneralSettings } from '@/lib/shared/services/settings.service';

/**
 * Resolved white-label branding — the single source of truth for the product
 * name, artwork and certificate URLs shown anywhere in the UI, in exported PDFs
 * and on payment gateway checkouts.
 *
 * Everything here is public by definition (it is rendered to anonymous visitors
 * on /verify and /report), so it is served unauthenticated from /api/branding.
 * Anything secret belongs in GeneralSettings, not here.
 */
export interface Branding {
    /** Product/brand name, e.g. "Pramaan". Used wherever the product is named. */
    siteName: string;
    /** Wordmark shown in the sidebar, auth pages and report headers. */
    logoUrl: string;
    /** Browser tab icon; empty means "leave the framework default alone". */
    faviconUrl: string;
    /** Illustration beside the login/register forms. */
    loginImageUrl: string;
    /** Base URL encoded into certificate QR codes (no trailing slash). */
    verifyBaseUrl: string;
    supportEmail: string;
    companyName: string;
    /** Public marketing site, linked from the customer auth pages. */
    websiteUrl: string;
}

/** Artwork bundled in /public — used until an admin uploads a replacement. */
const DEFAULT_LOGO = '/prmn_logo.png';
const DEFAULT_LOGIN_IMAGE = '/loginImg.png';

/**
 * Where certificate QR codes pointed before this was configurable. Kept as the
 * fallback so QRs on already-printed certificates keep resolving.
 */
const LEGACY_VERIFY_BASE = 'https://pramaan-dashboard.gadgetguruz.com';

/** Likewise the marketing site the customer auth pages linked to. */
const LEGACY_WEBSITE = 'https://pramaan.gadgetguruz.com';

export const DEFAULT_BRANDING: Branding = {
    siteName: 'Pramaan',
    logoUrl: DEFAULT_LOGO,
    faviconUrl: '',
    loginImageUrl: DEFAULT_LOGIN_IMAGE,
    verifyBaseUrl: LEGACY_VERIFY_BASE,
    supportEmail: '',
    companyName: '',
    websiteUrl: LEGACY_WEBSITE,
};

// Branding is read on nearly every server render (root layout) but changes only
// when an admin saves settings, so a short process-local TTL keeps the DB out of
// the hot path without making saves feel stale.
const TTL_MS = 60_000;
let cached: { value: Branding; expiresAt: number } | null = null;

/** Drop the cache after a settings/branding write so the change shows at once. */
export function invalidateBrandingCache(): void {
    cached = null;
}

function resolve(settings: Awaited<ReturnType<typeof getGeneralSettings>>): Branding {
    return {
        siteName: settings.siteName || DEFAULT_BRANDING.siteName,
        logoUrl: settings.logoUrl || DEFAULT_LOGO,
        faviconUrl: settings.faviconUrl || '',
        loginImageUrl: settings.loginImageUrl || DEFAULT_LOGIN_IMAGE,
        // Legacy constant before NEXT_PUBLIC_APP_URL on purpose: until an admin
        // sets this explicitly, already-printed QR codes must keep resolving.
        verifyBaseUrl: (settings.verifyBaseUrl || LEGACY_VERIFY_BASE).replace(/\/+$/, ''),
        supportEmail: settings.supportEmail || '',
        companyName: settings.companyName || '',
        websiteUrl: (settings.websiteUrl || LEGACY_WEBSITE).replace(/\/+$/, ''),
    };
}

/**
 * Resolved branding for server components, PDF export and payment gateways.
 * Never throws — a database hiccup falls back to the bundled defaults rather
 * than blanking the product name on every page.
 */
export async function getBranding(): Promise<Branding> {
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.value;
    try {
        const value = resolve(await getGeneralSettings());
        cached = { value, expiresAt: now + TTL_MS };
        return value;
    } catch {
        return DEFAULT_BRANDING;
    }
}
