import { NextRequest, NextResponse } from 'next/server';
import { AuthenticatedUser } from '@/lib/auth-middleware';
import { UserRole } from '@/lib/types';
import { ForbiddenError, TooManyRequestsError, UnauthorizedError } from '@/lib/http/errors';
import { toResponse, wrap } from '@/lib/http/handler';
import { hit, rateLimitHeaders } from '@/lib/http/rate-limit';
import { headersForKey } from './cors';
import * as repo from './keys.repo';
import { ResolvedPartnerKey } from './keys.repo';
import { hashKey } from './keys.service';
import { PartnerScope, canOwnPartnerKey } from './scopes';
import { record } from './usage';

/**
 * Authentication for `/api/partner/v1/*`.
 *
 * A partner key authenticates *as a user*, so every route below it can call the
 * same service functions the dashboard calls and inherit role checks and row
 * visibility unchanged. The key adds two things on top: a scope gate, and a
 * per-key rate limit.
 *
 * Server-to-server by default: no CORS headers are emitted unless the key has
 * registered browser origins, so a key cannot be used from a browser (and
 * therefore cannot leak into one) until someone opts in per integration.
 */

export interface PartnerContext {
    /** The key's owner, shaped exactly like any other authenticated principal. */
    user: AuthenticatedUser;
    key: ResolvedPartnerKey;
    params: Record<string, string>;
}

type PartnerHandler = (request: NextRequest, ctx: PartnerContext) => Promise<NextResponse>;

/** `last_used_at` is a diagnostic, not an audit trail — one write per key per minute. */
const TOUCH_INTERVAL_MS = 60_000;
const lastTouched = new Map<number, number>();

/**
 * Read the key from `X-API-Key` or `Authorization: Bearer pk_...`.
 * Query-string keys are never accepted: they end up in logs and referrers.
 */
function extractKey(request: NextRequest): string | null {
    const header = request.headers.get('x-api-key')?.trim();
    if (header) return header;
    const auth = request.headers.get('authorization');
    const bearer = auth?.match(/^Bearer\s+(pk_\S+)$/i)?.[1];
    return bearer ?? null;
}

async function resolve(request: NextRequest): Promise<ResolvedPartnerKey> {
    const presented = extractKey(request);
    if (!presented) throw new UnauthorizedError('Missing API key');

    const key = await repo.findLiveByHash(hashKey(presented));
    if (!key) throw new UnauthorizedError('Invalid or revoked API key');

    // Defence in depth: a key must never resolve to a platform-wide principal,
    // even if its owner's role was changed after the key was issued.
    if (!canOwnPartnerKey(key.user.role)) {
        throw new ForbiddenError('This account cannot be used with the partner API');
    }

    const now = Date.now();
    if ((lastTouched.get(key.keyId) ?? 0) + TOUCH_INTERVAL_MS < now) {
        lastTouched.set(key.keyId, now);
        void repo.touchLastUsed(key.keyId).catch(() => { });
    }

    return key;
}

export interface PartnerGate {
    scopes?: PartnerScope | PartnerScope[] | null;
    /**
     * Roles allowed through, when the underlying feature is narrower than
     * PARTNER_ROLES — fleet and user management are gated this way on the
     * dashboard, and the partner API must not be a way around that.
     */
    roles?: readonly UserRole[];
}

/**
 * Wrap a partner route: authenticate the key, enforce its scopes (and role, when
 * the feature is role-gated), apply the key's rate limit, and stamp
 * `X-RateLimit-*` onto the response.
 *
 * ```ts
 * export const GET = withPartner('qc:read', async (req, { user }) =>
 *     json(await listResults(user, parseQuery(req, listQuerySchema))))
 *
 * export const POST = withPartner({ scopes: 'fleet:write', roles: FLEET_ROLES }, handler)
 * ```
 */
export function withPartner(
    gate: PartnerScope | PartnerScope[] | null | PartnerGate,
    handler: PartnerHandler
) {
    const { scopes, roles }: PartnerGate =
        gate !== null && typeof gate === 'object' && !Array.isArray(gate) ? gate : { scopes: gate };
    const needed = !scopes ? [] : Array.isArray(scopes) ? scopes : [scopes];

    return wrap(async (request, { params }) => {
        // A failure here has no key to attribute, so it is the one path that
        // produces no usage row — `wrap` turns it into the 401.
        const key = await resolve(request);

        const limit = hit(`partner:${key.keyId}`, key.rateLimitPerMin);
        const headers: Record<string, string> = {
            ...rateLimitHeaders(limit),
            ...headersForKey(request, key.allowedOrigins),
        };

        // Everything past this point is answered rather than thrown, so one place
        // stamps the headers and counts the call whatever the outcome.
        let response: NextResponse;
        try {
            if (!limit.allowed) {
                headers['Retry-After'] = String(Math.max(1, limit.resetAt - Math.ceil(Date.now() / 1000)));
                throw new TooManyRequestsError();
            }

            const missing = needed.filter((s) => !key.scopes.includes(s));
            if (missing.length) {
                throw new ForbiddenError(`This API key is missing the ${missing.join(', ')} scope`);
            }
            if (roles && !roles.includes(key.user.role)) {
                throw new ForbiddenError(`${key.user.role} accounts cannot use this endpoint`);
            }

            const user: AuthenticatedUser = {
                id: key.user.id,
                username: key.user.username,
                role: key.user.role,
                created_by: key.user.createdBy ?? undefined,
            };
            response = await handler(request, { user, key, params });
        } catch (err) {
            response = toResponse(err);
        }

        record(key.keyId, request.nextUrl.pathname, response.status);
        return withHeaders(response, headers);
    });
}

function withHeaders(response: NextResponse, headers: Record<string, string>): NextResponse {
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
}
