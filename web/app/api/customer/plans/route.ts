import { wrap, json } from '@/lib/http/handler';
import { listPlans } from '@/lib/shared/services/plans.service';

// GET /api/customer/plans - active plans for the storefront (public catalog)
export const GET = wrap(async () => {
    return json(await listPlans(false));
});
