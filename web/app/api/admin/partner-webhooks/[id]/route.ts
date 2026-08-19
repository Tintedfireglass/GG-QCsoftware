import { withAuth, json } from '@/lib/http/handler';
import { ValidationError } from '@/lib/http/errors';
import { parseBody } from '@/lib/http/validate';
import { toggleWebhookSchema } from '@/lib/partner/schemas';
import { deleteWebhook, setWebhookActive } from '@/lib/partner/webhooks.service';

function parseId(raw: string): number {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid webhook id');
    return id;
}

// PATCH /api/admin/partner-webhooks/{id} — pause, or re-enable one that was
// auto-disabled after repeated failures.
export const PATCH = withAuth(['SuperAdmin'], async (request, { user, params }) => {
    const { isActive } = await parseBody(request, toggleWebhookSchema);
    await setWebhookActive(user, parseId(params.id), isActive);
    return json({ success: true });
});

// DELETE /api/admin/partner-webhooks/{id} — remove the subscription and its history.
export const DELETE = withAuth(['SuperAdmin'], async (_request, { user, params }) => {
    await deleteWebhook(user, parseId(params.id));
    return json({ success: true });
});
