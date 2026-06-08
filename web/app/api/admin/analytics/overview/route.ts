import { withAuth, json } from '@/lib/http/handler';
import { getOverview } from '@/lib/shared/services/analytics.service';

// GET /api/admin/analytics/overview?range=7d|30d|90d
export const GET = withAuth(['SuperAdmin'], async (request) => {
    const range = request.nextUrl.searchParams.get('range') || '30d';
    return json(await getOverview(range));
});
