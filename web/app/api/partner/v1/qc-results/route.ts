import { json } from '@/lib/http/handler';
import { parseQuery } from '@/lib/http/validate';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { listQuerySchema } from '@/lib/platforms/windows/domain/schemas/qc-results';
import { listResults } from '@/lib/platforms/windows/services/qc-results.service';

// GET /api/partner/v1/qc-results — QC results visible to the key's account.
// Same filters, paging (limit caps at 200) and shape as the dashboard list.
export const GET = withPartner('qc:read', async (request, { user }) =>
    json(await listResults(user, parseQuery(request, listQuerySchema)))
);

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
