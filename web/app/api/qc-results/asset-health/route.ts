import { withAuth, json } from '@/lib/http/handler';
import { assetHealthSummary } from '@/lib/platforms/windows/services/qc-results.service';

// GET /api/qc-results/asset-health - comprehensive asset health counts over the latest report per machine
export const GET = withAuth(null, async (_request, { user }) => {
    return json(await assetHealthSummary(user));
});
