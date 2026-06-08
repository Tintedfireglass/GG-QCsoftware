import { withAuth, json } from '@/lib/http/handler';
import { getOrder } from '@/lib/shared/services/orders.service';

// GET /api/admin/orders/[id] — order detail (customer, plan, license key)
export const GET = withAuth(['SuperAdmin'], async (_request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return json({ error: 'Invalid order ID' }, { status: 400 });
    return json(await getOrder(id));
});
