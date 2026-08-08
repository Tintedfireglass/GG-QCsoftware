import { wrap, json } from '@/lib/http/handler';
import { hostFromHeaders } from '@/lib/shared/branding-host';
import { getBrandingForHost } from '@/lib/shared/services/reseller-branding.service';

// GET /api/branding - white-label branding for the UI (public).
// Public on purpose: anonymous visitors render /verify and /report, and the
// login page needs the logo before any token exists.
//
// Resolved from the request host, so a reseller's assigned domain gets that
// reseller's logo and colour — which is also why the response must vary by host.
export const GET = wrap(async (request) => {
    const branding = await getBrandingForHost(hostFromHeaders(request.headers));
    return json(branding, {
        // Short cache: branding changes rarely, but an admin saving it should see
        // the new logo within a minute rather than after a hard refresh.
        headers: {
            'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
            Vary: 'Host, X-Forwarded-Host',
        },
    });
});
