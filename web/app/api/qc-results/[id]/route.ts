import { withAuth, json } from '@/lib/http/handler';
import { getResultDetail, hideResult } from '@/lib/platforms/windows/services/qc-results.service';

// GET /api/qc-results/[id] - single QC result with test results + previous report
export const GET = withAuth(null, async (_request, { user, params }) => {
    return json(await getResultDetail(user, params.id));
});

// DELETE /api/qc-results/[id] - hide a QC result
export const DELETE = withAuth(null, async (_request, { user, params }) => {
    await hideResult(user, params.id);
    return json({ success: true });
});
