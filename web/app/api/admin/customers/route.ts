import { withAuth, json } from '@/lib/http/handler';
import { listCustomers } from '@/lib/shared/services/customer.service';

// GET /api/admin/customers?status=&type=&search=&page=&limit= — list store/app customers
export const GET = withAuth(['SuperAdmin'], async (request) => {
    const sp = request.nextUrl.searchParams;
    const page = parseInt(sp.get('page') || '1', 10);
    const limit = parseInt(sp.get('limit') || '20', 10);
    return json(await listCustomers({
        status: sp.get('status') || undefined,
        type: sp.get('type') || undefined,
        search: sp.get('search') || undefined,
        page: Number.isNaN(page) ? 1 : page,
        limit: Number.isNaN(limit) ? 20 : limit,
    }));
});
