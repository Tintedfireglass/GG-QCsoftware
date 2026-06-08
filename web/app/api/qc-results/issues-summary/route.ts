import { withAuth, json } from '@/lib/http/handler';
import { issuesSummary } from '@/lib/platforms/windows/services/qc-results.service';

// GET /api/qc-results/issues-summary - device-issue counts over the latest report per machine
export const GET = withAuth(null, async (_request, { user }) => {
    return json(await issuesSummary(user));
});
