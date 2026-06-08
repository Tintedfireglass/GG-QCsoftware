import { withAuth, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { createCouponSchema } from '@/lib/shared/domain/schemas/coupons';
import { listCoupons, createCoupon } from '@/lib/shared/services/coupons.service';

// GET /api/admin/coupons - list all coupons
export const GET = withAuth(['SuperAdmin'], async () => {
    return json(await listCoupons());
});

// POST /api/admin/coupons - create a coupon
export const POST = withAuth(['SuperAdmin'], async (request) => {
    const body = await parseBody(request, createCouponSchema);
    return json(await createCoupon(body), { status: 201 });
});
