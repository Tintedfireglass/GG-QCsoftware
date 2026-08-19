import { json } from '@/lib/http/handler';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { getAdminReport } from '@/lib/platforms/android/services/admin-mobile-reports.service';

// GET /api/partner/v1/mobile-reports/{reportId} — one mobile report in full.
export const GET = withPartner('reports:read', async (_request, { user, params }) =>
    json(await getAdminReport(user, params.reportId))
);

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
