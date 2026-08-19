import { withAuth, json } from '@/lib/http/handler';
import { ValidationError } from '@/lib/http/errors';
import { parseBody } from '@/lib/http/validate';
import { createWebhookSchema } from '@/lib/partner/schemas';
import { createWebhook, listWebhooks } from '@/lib/partner/webhooks.service';

// GET /api/admin/partner-webhooks?userId= — subscriptions for one account.
export const GET = withAuth(['SuperAdmin'], async (request, { user }) => {
    const userId = Number(request.nextUrl.searchParams.get('userId'));
    if (!Number.isInteger(userId) || userId <= 0) throw new ValidationError('userId is required');
    return json({ webhooks: await listWebhooks(user, userId) });
});

// POST /api/admin/partner-webhooks — register an endpoint. The signing secret in
// the response is shown once and never stored in retrievable form.
export const POST = withAuth(['SuperAdmin'], async (request, { user }) => {
    const body = await parseBody(request, createWebhookSchema);
    const { webhook, secret } = await createWebhook(user, body);
    return json({ webhook, secret }, { status: 201 });
});
