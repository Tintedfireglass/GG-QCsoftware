import { wrap, json } from '@/lib/http/handler';
import { requireCronOrAdmin } from '@/lib/http/cron-auth';
import { runWebhookRetries } from '@/lib/partner/webhooks.service';

// POST /api/admin/partner-webhooks/retry — re-attempt deliveries whose backoff
// has elapsed. There is no queue worker here, so a scheduler drives this
// (X-Cron-Secret); an admin can also run it by hand from a signed-in session.
// Safe to call often: it only picks up rows that are due.
export const POST = wrap(async (request) => {
    await requireCronOrAdmin(request);

    const raw = Number(request.nextUrl.searchParams.get('limit') ?? 50);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 200) : 50;
    return json(await runWebhookRetries(limit));
});
