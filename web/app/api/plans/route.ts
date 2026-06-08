import { NextResponse } from 'next/server';
import { wrap } from '@/lib/http/handler';
import { listPlans } from '@/lib/shared/services/plans.service';

// Public active-plans catalog — readable cross-origin by the store website.
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS });
}

// GET /api/plans - active plans for public storefronts.
export const GET = wrap(async () => {
    const data = await listPlans(false);
    return NextResponse.json(data, { headers: CORS });
});
