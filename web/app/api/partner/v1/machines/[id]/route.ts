import { json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { renameMachineSchema } from '@/lib/platforms/windows/domain/schemas/machines';
import { getMachineDetails, renameMachine } from '@/lib/platforms/windows/services/machines.service';

// GET /api/partner/v1/machines/{id} — machine detail with test/component history.
export const GET = withPartner('machines:read', async (_request, { user, params }) =>
    json(await getMachineDetails(user, params.id))
);

// PATCH /api/partner/v1/machines/{id} — set the human-friendly display name.
export const PATCH = withPartner('machines:write', async (request, { user, params }) => {
    const body = await parseBody(request, renameMachineSchema);
    return json(await renameMachine(user, params.id, body.customName));
});

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
