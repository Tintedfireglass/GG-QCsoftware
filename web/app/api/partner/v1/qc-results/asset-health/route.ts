import { json } from '@/lib/http/handler';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { assetHealthSummary } from '@/lib/platforms/windows/services/qc-results.service';

// GET /api/partner/v1/qc-results/asset-health — storage/thermal/tamper risk buckets.
export const GET = withPartner('qc:read', async (_request, { user }) =>
    json(await assetHealthSummary(user))
);

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
