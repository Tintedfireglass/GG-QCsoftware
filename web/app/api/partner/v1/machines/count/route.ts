import { json } from '@/lib/http/handler';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { countMachines } from '@/lib/platforms/windows/services/machines.service';

// GET /api/partner/v1/machines/count — visible machine count.
export const GET = withPartner('machines:read', async (_request, { user }) =>
    json(await countMachines(user))
);

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
