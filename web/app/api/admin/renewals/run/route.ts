import { withAuth, json } from '@/lib/http/handler';
import { runDueRenewals } from '@/lib/shared/services/renewals.service';

// POST /api/admin/renewals/run?withinDays=1 — charge due auto-renewals.
// Intended for a scheduled cron trigger; also runnable manually by an admin.
export const POST = withAuth(['SuperAdmin'], async (request) => {
    const raw = parseInt(request.nextUrl.searchParams.get('withinDays') || '1', 10);
    const withinDays = Number.isNaN(raw) ? 1 : Math.min(Math.max(raw, 0), 30);
    return json(await runDueRenewals(withinDays));
});
