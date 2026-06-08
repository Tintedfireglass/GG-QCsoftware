import { NextResponse } from 'next/server';
import { wrap, clientIp } from '@/lib/http/handler';
import { trackSchema } from '@/lib/shared/domain/schemas/analytics';
import { recordEvent } from '@/lib/shared/services/analytics.service';
import { countryFromHeaders } from '@/lib/shared/analytics/parse';
import { extractBearerToken, verifyCustomerToken } from '@/lib/customer-auth';

// Public, write-only analytics beacon — callable from the separate store website
// (different origin). No credentials/cookies, no sensitive response, so a wildcard
// CORS origin is appropriate.
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
};

function ok(body: unknown) {
    return NextResponse.json(body, { headers: CORS });
}

// CORS preflight.
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS });
}

// POST /api/track - best-effort: always 200, so a tracking failure never affects
// the visitor's experience.
export const POST = wrap(async (request) => {
    try {
        // Accept JSON or text/plain (text/plain avoids a CORS preflight for cross-origin beacons).
        const raw = await request.text();
        const parsed = trackSchema.safeParse(raw ? JSON.parse(raw) : {});
        if (!parsed.success) return ok({ ok: false });

        // Optional: link the visit to a logged-in customer (token verified, not trusted blindly).
        let customerUserId: number | null = null;
        const token = extractBearerToken(request.headers.get('authorization'));
        if (token) customerUserId = verifyCustomerToken(token)?.customerId ?? null;

        await recordEvent(parsed.data, {
            userAgent: request.headers.get('user-agent'),
            ip: clientIp(request),
            country: countryFromHeaders((h) => request.headers.get(h)),
            customerUserId,
        });
    } catch {
        // swallow — analytics must never break the storefront
    }
    return ok({ ok: true });
});
