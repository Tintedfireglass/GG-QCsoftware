import { withAuth, json } from '@/lib/http/handler';
import { parseQuery } from '@/lib/http/validate';
import { machinesListQuerySchema } from '@/lib/domain/schemas/machines';
import { countMachines, listMachines } from '@/lib/services/machines.service';

// GET visible machines (any authenticated user; role-scoped). `?countOnly=1`
// returns just the count for dashboard cards.
export const GET = withAuth(null, async (request, { user }) => {
    const { countOnly } = parseQuery(request, machinesListQuerySchema);
    return json(countOnly ? await countMachines(user) : await listMachines(user));
});
