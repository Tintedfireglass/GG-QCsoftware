import { json } from '@/lib/http/handler';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { issuesSummary } from '@/lib/platforms/windows/services/qc-results.service';

// GET /api/partner/v1/qc-results/issues-summary — device-issue counts over the
// latest report per machine.
export const GET = withPartner('qc:read', async (_request, { user }) =>
    json(await issuesSummary(user))
);

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
