import { withAuth, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { updateCouponSchema } from '@/lib/shared/domain/schemas/coupons';
import { updateCoupon, deleteCoupon } from '@/lib/shared/services/coupons.service';

// PATCH /api/admin/coupons/[id] - update a coupon
export const PATCH = withAuth(['SuperAdmin'], async (request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return json({ error: 'Invalid coupon ID' }, { status: 400 });
    const body = await parseBody(request, updateCouponSchema);
    return json(await updateCoupon(id, body));
});

// DELETE /api/admin/coupons/[id] - remove a coupon
export const DELETE = withAuth(['SuperAdmin'], async (_request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return json({ error: 'Invalid coupon ID' }, { status: 400 });
    return json(await deleteCoupon(id));
});
