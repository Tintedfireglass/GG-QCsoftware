import { withAuth, json } from '@/lib/http/handler';
import { listOrders } from '@/lib/shared/services/orders.service';

// GET /api/admin/orders?status=&search=&page=&limit= — list customer orders
export const GET = withAuth(['SuperAdmin'], async (request) => {
    const sp = request.nextUrl.searchParams;
    const page = parseInt(sp.get('page') || '1', 10);
    const limit = parseInt(sp.get('limit') || '20', 10);
    return json(await listOrders({
        status: sp.get('status') || undefined,
        search: sp.get('search') || undefined,
        page: Number.isNaN(page) ? 1 : page,
        limit: Number.isNaN(limit) ? 20 : limit,
    }));
});
