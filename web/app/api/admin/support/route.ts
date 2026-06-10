import { withAuth, json } from '@/lib/http/handler';
import { listTickets } from '@/lib/shared/services/support.service';

// GET /api/admin/support?status=&search=&page=&limit= — support ticket inbox.
export const GET = withAuth(['SuperAdmin'], async (request) => {
    const sp = request.nextUrl.searchParams;
    return json(await listTickets({
        status: sp.get('status') || undefined,
        search: sp.get('search') || undefined,
        page: sp.get('page') ? parseInt(sp.get('page')!, 10) : undefined,
        limit: sp.get('limit') ? parseInt(sp.get('limit')!, 10) : undefined,
    }));
});
