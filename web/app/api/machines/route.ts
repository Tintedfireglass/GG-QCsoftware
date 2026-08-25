import { withAuth, json } from '@/lib/http/handler';
import { parseQuery } from '@/lib/http/validate';
import { machinesListQuerySchema } from '@/lib/platforms/windows/domain/schemas/machines';
import { countMachines, listMachines } from '@/lib/platforms/windows/services/machines.service';

// GET visible machines (any authenticated user; role-scoped). `?countOnly=1`
// returns just the count for dashboard cards.
export const GET = withAuth(null, async (request, { user }) => {
    // countOnly is the whole visible fleet, archived or not; only the list splits.
    const { countOnly, archived } = parseQuery(request, machinesListQuerySchema);
    return json(countOnly ? await countMachines(user) : await listMachines(user, archived));
});
