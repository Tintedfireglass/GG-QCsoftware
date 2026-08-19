import { json } from '@/lib/http/handler';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { listMachines } from '@/lib/platforms/windows/services/machines.service';

// GET /api/partner/v1/machines — machines visible to the key's account.
export const GET = withPartner('machines:read', async (_request, { user }) =>
    json(await listMachines(user))
);

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
