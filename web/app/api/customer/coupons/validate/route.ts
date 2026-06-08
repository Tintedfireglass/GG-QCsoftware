import { wrap, json } from '@/lib/http/handler';
import { requireCustomer } from '@/lib/http/customer-auth';
import { parseBody } from '@/lib/http/validate';
import { validateCouponSchema } from '@/lib/shared/domain/schemas/coupons';
import { previewCoupon } from '@/lib/shared/services/coupons.service';

// POST /api/customer/coupons/validate - preview a coupon discount before paying
export const POST = wrap(async (request) => {
    const { customerId } = requireCustomer(request);
    const body = await parseBody(request, validateCouponSchema);
    return json(await previewCoupon(body.code, body.planId, customerId));
});
