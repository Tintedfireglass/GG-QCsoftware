import { json } from '@/lib/http/handler';
import { parseQuery } from '@/lib/http/validate';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { adminMobileListQuerySchema } from '@/lib/platforms/android/domain/schemas/admin-mobile';
import { listAdminReports } from '@/lib/platforms/android/services/admin-mobile-reports.service';

// GET /api/partner/v1/mobile-reports — B2C mobile QC reports attributed to the
// account's licenses.
export const GET = withPartner('reports:read', async (request, { user }) =>
    json(await listAdminReports(user, parseQuery(request, adminMobileListQuerySchema)))
);

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
