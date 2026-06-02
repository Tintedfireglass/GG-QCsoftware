import { withAuth, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { lifecycleEventSchema } from '@/lib/domain/schemas/fleet';
import { getLifecycle, addLifecycleEvent } from '@/lib/services/fleet.service';

const FLEET_ROLES = ['SuperAdmin', 'Enterprise', 'Reseller'] as const;

// GET /api/fleet/[machineId]/lifecycle - list lifecycle events
export const GET = withAuth([...FLEET_ROLES], async (_request, { user, params }) => {
    return json(await getLifecycle(user, params.machineId));
});

// POST /api/fleet/[machineId]/lifecycle - record a lifecycle event
export const POST = withAuth([...FLEET_ROLES], async (request, { user, params }) => {
    const body = await parseBody(request, lifecycleEventSchema);
    return json(await addLifecycleEvent(user, params.machineId, body), { status: 201 });
});
