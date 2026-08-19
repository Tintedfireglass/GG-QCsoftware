import { json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { FLEET_ROLES } from '@/lib/partner/scopes';
import { lifecycleEventSchema } from '@/lib/platforms/windows/domain/schemas/fleet';
import { addLifecycleEvent, getLifecycle } from '@/lib/platforms/windows/services/fleet.service';

// GET /api/partner/v1/fleet/{machineId}/lifecycle — events for one machine.
export const GET = withPartner(
    { scopes: 'fleet:read', roles: FLEET_ROLES },
    async (_request, { user, params }) => json(await getLifecycle(user, params.machineId))
);

// POST /api/partner/v1/fleet/{machineId}/lifecycle — record an event.
export const POST = withPartner(
    { scopes: 'fleet:write', roles: FLEET_ROLES },
    async (request, { user, params }) => {
        const body = await parseBody(request, lifecycleEventSchema);
        return json(await addLifecycleEvent(user, params.machineId, body), { status: 201 });
    }
);

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
