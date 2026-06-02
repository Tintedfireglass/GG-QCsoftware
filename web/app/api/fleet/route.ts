import { withAuth, json } from '@/lib/http/handler';
import { parseQuery, parseBody } from '@/lib/http/validate';
import { fleetListQuerySchema, fleetEnrollSchema } from '@/lib/domain/schemas/fleet';
import { listFleet, enrollMachine } from '@/lib/services/fleet.service';

const FLEET_ROLES = ['SuperAdmin', 'Enterprise', 'Reseller'] as const;

// GET /api/fleet - list fleet machines + health summary
export const GET = withAuth([...FLEET_ROLES], async (request, { user }) => {
    const q = parseQuery(request, fleetListQuerySchema);
    return json(await listFleet(user, q));
});

// POST /api/fleet - enroll a machine into the fleet
export const POST = withAuth([...FLEET_ROLES], async (request, { user }) => {
    const body = await parseBody(request, fleetEnrollSchema);
    return json(await enrollMachine(user, body), { status: 201 });
});
