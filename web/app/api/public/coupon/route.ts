import { NextResponse } from 'next/server';
import { z } from 'zod';
import { wrap } from '@/lib/http/handler';
import { previewCouponPublic } from '@/lib/shared/services/coupons.service';

// Public guest coupon preview — callable cross-origin from the store website.
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

const schema = z.object({
    code: z.string().trim().min(1),
    planId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(999).optional(),
});

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS });
}

// POST /api/public/coupon - validate a coupon for a plan + quantity (no login).
export const POST = wrap(async (request) => {
    const raw = await request.text();
    let body: unknown = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* validation fails below */ }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400, headers: CORS });
    }

    try {
        const preview = await previewCouponPublic(parsed.data.code, parsed.data.planId, parsed.data.quantity);
        return NextResponse.json({ ok: true, ...preview }, { headers: CORS });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid coupon';
        return NextResponse.json({ ok: false, error: message }, { status: 400, headers: CORS });
    }
});
