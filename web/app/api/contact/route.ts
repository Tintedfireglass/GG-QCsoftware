import { NextResponse } from 'next/server';
import { wrap, clientIp } from '@/lib/http/handler';
import { contactSubmitSchema } from '@/lib/shared/domain/schemas/contact';
import { submitContact } from '@/lib/shared/services/contact.service';

// Public contact-form endpoint — callable from the separate store website
// (different origin). No credentials, so a wildcard CORS origin is appropriate.
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

// CORS preflight.
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS });
}

// POST /api/contact - store a contact/partnership submission.
export const POST = wrap(async (request) => {
    // Accept JSON or text/plain (text/plain avoids a CORS preflight for cross-origin posts).
    const raw = await request.text();
    let body: unknown = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* invalid → validation fails below */ }

    const parsed = contactSubmitSchema.safeParse(body);
    if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message || 'Invalid submission';
        return NextResponse.json({ ok: false, error: msg }, { status: 400, headers: CORS });
    }

    try {
        const result = await submitContact(parsed.data, {
            ip: clientIp(request),
            userAgent: request.headers.get('user-agent'),
        });
        return NextResponse.json(result, { headers: CORS });
    } catch (err) {
        // Surface validation messages (e.g. spam guard) to the cross-origin form.
        const message = err instanceof Error ? err.message : 'Could not submit';
        return NextResponse.json({ ok: false, error: message }, { status: 400, headers: CORS });
    }
});
