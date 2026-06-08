import { withAuth, json } from '@/lib/http/handler';
import { listContacts } from '@/lib/shared/services/contact.service';

// GET /api/admin/contacts?status=&page=&limit= - list contact submissions
export const GET = withAuth(['SuperAdmin'], async (request) => {
    const sp = request.nextUrl.searchParams;
    return json(await listContacts({
        status: sp.get('status') || undefined,
        page: sp.get('page') ? parseInt(sp.get('page')!, 10) : undefined,
        limit: sp.get('limit') ? parseInt(sp.get('limit')!, 10) : undefined,
    }));
});
