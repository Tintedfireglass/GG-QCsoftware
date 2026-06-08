import { withAuth, json } from '@/lib/http/handler';
import { getResultDetail } from '@/lib/platforms/windows/services/qc-results.service';

// GET /api/qc-results/[id] - single QC result with test results + previous report
export const GET = withAuth(null, async (_request, { user, params }) => {
    return json(await getResultDetail(user, params.id));
});
