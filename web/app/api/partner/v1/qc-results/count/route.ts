import { json } from '@/lib/http/handler';
import { parseQuery } from '@/lib/http/validate';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { listQuerySchema } from '@/lib/platforms/windows/domain/schemas/qc-results';
import { countResults } from '@/lib/platforms/windows/services/qc-results.service';

// GET /api/partner/v1/qc-results/count — total matching the same filters as the list.
export const GET = withPartner('qc:read', async (request, { user }) =>
    json(await countResults(user, parseQuery(request, listQuerySchema)))
);

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
