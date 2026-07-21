import { wrap, json } from '@/lib/http/handler';
import { getBranding } from '@/lib/shared/services/branding.service';

// GET /api/branding - white-label branding for the UI (public).
// Public on purpose: anonymous visitors render /verify and /report, and the
// login page needs the logo before any token exists.
export const GET = wrap(async () => {
    return json(await getBranding(), {
        // Short cache: branding changes rarely, but an admin saving it should see
        // the new logo within a minute rather than after a hard refresh.
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
});
