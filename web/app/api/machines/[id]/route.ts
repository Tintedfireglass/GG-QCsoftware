import { withAuth, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { renameMachineSchema } from '@/lib/domain/schemas/machines';
import { getMachineDetails, renameMachine } from '@/lib/services/machines.service';

// GET machine detail + test/component history (any authenticated user; role-scoped)
export const GET = withAuth(null, async (_request, { user, params }) => {
    return json(await getMachineDetails(user, params.id));
});

// PATCH machine custom name
export const PATCH = withAuth(null, async (request, { user, params }) => {
    const body = await parseBody(request, renameMachineSchema);
    return json(await renameMachine(user, params.id, body.customName));
});
