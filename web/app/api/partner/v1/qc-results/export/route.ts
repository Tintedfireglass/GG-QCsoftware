import { NextResponse } from 'next/server';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { exportQcResults } from '@/lib/platforms/windows/services/qc-export.service';
import { hostFromHeaders } from '@/lib/shared/branding-host';
import { APP_TIME_ZONE } from '@/lib/timezone';

// GET /api/partner/v1/qc-results/export — latest report per machine as XLSX or PDF.
// Returns a file, not JSON, so it is the one partner route that does not answer
// with the standard envelope.
export const GET = withPartner('reports:read', async (request, { user }) => {
    const sp = request.nextUrl.searchParams;
    const result = await exportQcResults(user, {
        search: sp.get('search')?.trim() || undefined,
        userIdParam: sp.get('userId'),
        format: (sp.get('format') || 'xlsx').toLowerCase(),
        timeZone: sp.get('timeZone') || APP_TIME_ZONE,
        host: hostFromHeaders(request.headers),
    });

    return new NextResponse(result.body, {
        headers: {
            'Content-Type': result.contentType,
            'Content-Disposition': `attachment; filename="${result.filename}"`,
        },
    });
});

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
