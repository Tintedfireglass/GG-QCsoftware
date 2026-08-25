import { withAuth, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { updateMachineSchema } from '@/lib/platforms/windows/domain/schemas/machines';
import { getMachineDetails, updateMachine } from '@/lib/platforms/windows/services/machines.service';

// GET machine detail + test/component history (any authenticated user; role-scoped)
export const GET = withAuth(null, async (_request, { user, params }) => {
    return json(await getMachineDetails(user, params.id));
});

// PATCH machine custom name and/or archive state
export const PATCH = withAuth(null, async (request, { user, params }) => {
    const body = await parseBody(request, updateMachineSchema);
    return json(await updateMachine(user, params.id, body));
});
