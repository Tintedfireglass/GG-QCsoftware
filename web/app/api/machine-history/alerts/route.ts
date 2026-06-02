import { withAuth, json } from '@/lib/http/handler';
import { parseQuery } from '@/lib/http/validate';
import { alertsQuerySchema } from '@/lib/domain/schemas/machine-history';
import { machineHistoryAlerts } from '@/lib/services/machine-history.service';

// GET /api/machine-history/alerts - component grade-regression alerts
export const GET = withAuth(null, async (request, { user }) => {
    const q = parseQuery(request, alertsQuerySchema);
    return json(await machineHistoryAlerts(user, q));
});
