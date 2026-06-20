import { withAuth, json } from '@/lib/http/handler';
import { listFreeTrials } from '@/lib/shared/services/free-trials.service';

// GET /api/admin/free-trials?search=&page=&limit= - list free trials (SuperAdmin only)
export const GET = withAuth(['SuperAdmin'], async (request) => {
    const sp = request.nextUrl.searchParams;
    const page = parseInt(sp.get('page') || '1', 10);
    const limit = parseInt(sp.get('limit') || '20', 10);
    return json(await listFreeTrials({
        search: sp.get('search') || undefined,
        page: Number.isNaN(page) ? 1 : page,
        limit: Number.isNaN(limit) ? 20 : limit,
    }));
});
