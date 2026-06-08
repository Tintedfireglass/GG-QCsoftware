import { withAuth, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { updatePlanSchema } from '@/lib/shared/domain/schemas/plans';
import { updatePlan, deletePlan } from '@/lib/shared/services/plans.service';

// PATCH /api/admin/plans/[id] - update a plan
export const PATCH = withAuth(['SuperAdmin'], async (request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return json({ error: 'Invalid plan ID' }, { status: 400 });
    const body = await parseBody(request, updatePlanSchema);
    return json(await updatePlan(id, body));
});

// DELETE /api/admin/plans/[id] - remove a plan
export const DELETE = withAuth(['SuperAdmin'], async (_request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return json({ error: 'Invalid plan ID' }, { status: 400 });
    return json(await deletePlan(id));
});
