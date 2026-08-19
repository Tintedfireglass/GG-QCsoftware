import { withAuth, json } from '@/lib/http/handler';
import { ValidationError } from '@/lib/http/errors';
import { listDeliveries } from '@/lib/partner/webhooks.service';

// GET /api/admin/partner-webhooks/{id}/deliveries — recent attempts, for
// answering "we never received that event".
export const GET = withAuth(['SuperAdmin'], async (_request, { user, params }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid webhook id');
    return json({ deliveries: await listDeliveries(user, id) });
});
