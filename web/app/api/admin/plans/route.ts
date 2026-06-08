import { withAuth, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { createPlanSchema } from '@/lib/shared/domain/schemas/plans';
import { listPlans, createPlan } from '@/lib/shared/services/plans.service';

// GET /api/admin/plans - list all plans (including inactive)
export const GET = withAuth(['SuperAdmin'], async () => {
    return json(await listPlans(true));
});

// POST /api/admin/plans - create a plan
export const POST = withAuth(['SuperAdmin'], async (request) => {
    const body = await parseBody(request, createPlanSchema);
    return json(await createPlan(body), { status: 201 });
});
