import { NextResponse } from 'next/server';
import { wrap } from '@/lib/http/handler';
import { publicCheckoutSchema } from '@/lib/shared/domain/schemas/public-checkout';
import { guestCheckout } from '@/lib/shared/services/customer.service';

// Public guest checkout — callable cross-origin from the store website.
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS });
}

// POST /api/public/checkout - create (or reuse) a customer, start a plan checkout,
// and return the payment gateway redirect URL.
export const POST = wrap(async (request) => {
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    // Accept JSON or text/plain (text/plain avoids a CORS preflight).
    const raw = await request.text();
    let parsedBody: unknown = {};
    try { parsedBody = raw ? JSON.parse(raw) : {}; } catch { /* validation fails below */ }

    const parsed = publicCheckoutSchema.safeParse(parsedBody);
    if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message || 'Invalid checkout details';
        return NextResponse.json({ ok: false, error: msg }, { status: 400, headers: CORS });
    }

    try {
        const result = await guestCheckout({
            planId: parsed.data.planId,
            name: parsed.data.name,
            email: parsed.data.email_id,
            companyName: parsed.data.company_name ?? null,
            phone: parsed.data.phone_no ?? null,
            autoRenew: parsed.data.autoRenew,
            couponCode: parsed.data.couponCode ?? null,
            quantity: parsed.data.quantity ?? 1,
            platformCaps: parsed.data.platformCaps ?? null,
        }, appBaseUrl);
        return NextResponse.json({ ok: true, ...result }, { headers: CORS });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not start checkout';
        return NextResponse.json({ ok: false, error: message }, { status: 400, headers: CORS });
    }
});
