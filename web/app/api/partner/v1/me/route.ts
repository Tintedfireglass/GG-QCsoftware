import { json } from '@/lib/http/handler';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';

// GET /api/partner/v1/me — who this key authenticates as, and what it may do.
// Needs no scope: it is the call an integration makes to verify its credentials.
export const GET = withPartner(null, async (_request, { user, key }) =>
    json({
        account: { id: user.id, username: user.username, role: user.role },
        key: { id: key.keyId, scopes: key.scopes, rateLimitPerMin: key.rateLimitPerMin },
    })
);

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
