import { withAuth, json } from '@/lib/http/handler';
import { parseQuery } from '@/lib/http/validate';
import { listQuerySchema } from '@/lib/platforms/windows/domain/schemas/qc-results';
import { countResults } from '@/lib/platforms/windows/services/qc-results.service';

// GET /api/qc-results/count - count-only helper for dashboards (JWT required)
export const GET = withAuth(null, async (request, { user }) => {
    const q = parseQuery(request, listQuerySchema);
    return json(await countResults(user, q), {
        headers: { 'Cache-Control': 'private, max-age=5, stale-while-revalidate=25' },
    });
});
