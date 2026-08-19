import { json } from '@/lib/http/handler';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { getResultDetail, hideResult } from '@/lib/platforms/windows/services/qc-results.service';

// GET /api/partner/v1/qc-results/{id} — one result with its test rows.
export const GET = withPartner('qc:read', async (_request, { user, params }) =>
    json(await getResultDetail(user, params.id))
);

// DELETE /api/partner/v1/qc-results/{id} — hide a result from all listings.
// The row is retained; certificates already issued stay verifiable.
export const DELETE = withPartner('qc:write', async (_request, { user, params }) => {
    await hideResult(user, params.id);
    return json({ success: true });
});

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
