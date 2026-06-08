import { NextResponse } from 'next/server';
import { wrap } from '@/lib/http/handler';
import { listPublicCoupons } from '@/lib/shared/services/coupons.service';

// Public storefront coupon list — advertised (admin-flagged) coupons for a plan.
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS });
}

// GET /api/public/coupons?planId=2 - coupons safe to show for the given plan.
export const GET = wrap(async (request) => {
    const planId = parseInt(request.nextUrl.searchParams.get('planId') || '', 10);
    if (Number.isNaN(planId)) {
        return NextResponse.json({ coupons: [] }, { headers: CORS });
    }
    const data = await listPublicCoupons(planId);
    return NextResponse.json(data, { headers: CORS });
});
