import { withAuth, json } from '@/lib/http/handler';
import * as paymentService from '@/lib/shared/services/payment.service';

// POST /api/admin/orders/:id/refund — refund a paid customer order.
export const POST = withAuth(['SuperAdmin'], async (request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) {
        return json({ error: 'Invalid order ID' }, { status: 400 });
    }
    const result = await paymentService.refundOrder(id);
    return json({ success: true, orderId: result.orderId, refundRef: result.refundRef ?? null });
});
