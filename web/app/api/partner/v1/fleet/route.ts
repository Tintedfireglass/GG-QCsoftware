import { json } from '@/lib/http/handler';
import { parseBody, parseQuery } from '@/lib/http/validate';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { FLEET_ROLES } from '@/lib/partner/scopes';
import { fleetEnrollSchema, fleetListQuerySchema } from '@/lib/platforms/windows/domain/schemas/fleet';
import { enrollMachine, listFleet } from '@/lib/platforms/windows/services/fleet.service';

// GET /api/partner/v1/fleet — fleet inventory with its health summary.
export const GET = withPartner(
    { scopes: 'fleet:read', roles: FLEET_ROLES },
    async (request, { user }) => json(await listFleet(user, parseQuery(request, fleetListQuerySchema)))
);

// POST /api/partner/v1/fleet — enrol a machine into the fleet.
export const POST = withPartner(
    { scopes: 'fleet:write', roles: FLEET_ROLES },
    async (request, { user }) => {
        const body = await parseBody(request, fleetEnrollSchema);
        return json(await enrollMachine(user, body), { status: 201 });
    }
);

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
