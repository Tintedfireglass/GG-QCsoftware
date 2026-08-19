import { NextRequest, NextResponse } from 'next/server';
import * as repo from './keys.repo';

/**
 * Per-key CORS for `/api/partner/v1/*`.
 *
 * Off by default: a key with no `allowed_origins` gets no CORS headers, which is
 * what we want — a key embedded in front-end code is a leaked key, so browser
 * access is opt-in per integration.
 *
 * The preflight is the awkward part: a browser sends `OPTIONS` without the
 * `x-api-key` header, so there is no key to look up. It is answered from the set
 * of origins registered across all live keys instead; the real request that
 * follows still has to authenticate and match its own key's origins, so this
 * leaks nothing but "some integration registered this origin".
 */

const ALLOWED_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'x-api-key, authorization, content-type';
const MAX_AGE = '86400';

/** Registered origins change only when an admin edits a key. */
const CACHE_TTL_MS = 60_000;
let cache: { origins: Set<string>; expiresAt: number } | null = null;

async function registeredOrigins(): Promise<Set<string>> {
    const now = Date.now();
    if (cache && cache.expiresAt > now) return cache.origins;
    const origins = new Set(await repo.listAllowedOrigins());
    cache = { origins, expiresAt: now + CACHE_TTL_MS };
    return origins;
}

/** Drop the cache after an admin edits a key's origins. */
export function invalidateOriginCache(): void {
    cache = null;
}

function corsHeaders(origin: string): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': origin,
        // The response differs per origin, so it must never be cached across them.
        Vary: 'Origin',
        'Access-Control-Allow-Methods': ALLOWED_METHODS,
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Max-Age': MAX_AGE,
    };
}

/**
 * Headers for an authenticated partner response, or none when the request did
 * not come from a browser origin this key permits.
 */
export function headersForKey(request: NextRequest, allowedOrigins: string[]): Record<string, string> {
    const origin = request.headers.get('origin');
    if (!origin || !allowedOrigins.includes(origin)) return {};
    return corsHeaders(origin);
}

/**
 * Preflight handler. Every partner route exports this as `OPTIONS` so browsers
 * get an answer without each route hand-rolling one.
 */
export async function partnerPreflight(request: NextRequest): Promise<NextResponse> {
    const origin = request.headers.get('origin');
    if (!origin || !(await registeredOrigins()).has(origin)) {
        // Not a registered browser origin: answer without CORS headers, which the
        // browser turns into the failure it should be.
        return new NextResponse(null, { status: 204 });
    }
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}
