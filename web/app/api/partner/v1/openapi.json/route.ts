import { NextResponse } from 'next/server';
import { wrap } from '@/lib/http/handler';
import { buildPartnerOpenApiDocument } from '@/lib/openapi/document';
import { getBranding } from '@/lib/shared/services/branding.service';

// GET /api/partner/v1/openapi.json — the machine-readable partner contract.
//
// Public on purpose: it is what a reseller feeds to their code generator or
// Postman. It contains only /api/partner/v1/*, never the dashboard's own routes.
export const GET = wrap(async () => {
    const { siteName } = await getBranding();
    return NextResponse.json(buildPartnerOpenApiDocument(siteName), {
        headers: {
            'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
            // The spec carries no secrets and doc tooling fetches it from
            // arbitrary origins, so this one route is open to all of them.
            'Access-Control-Allow-Origin': '*',
        },
    });
});
