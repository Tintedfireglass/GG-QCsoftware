import { wrap, json } from '@/lib/http/handler';
import { requireCustomer } from '@/lib/http/customer-auth';
import { createCheckout } from '@/lib/shared/services/customer.service';

// POST /api/customer/checkout - create a purchase checkout session for a plan
export const POST = wrap(async (request) => {
    const { customerId, email } = requireCustomer(request);
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    let planId: number | null = null;
    let autoRenew = false;
    let couponCode: string | null = null;
    try {
        const body = await request.json();
        const raw = body?.planId ?? body?.plan_id;
        if (typeof raw === 'number') planId = raw;
        autoRenew = body?.autoRenew === true || body?.auto_renew === true;
        const code = body?.couponCode ?? body?.coupon_code;
        if (typeof code === 'string') couponCode = code;
    } catch { /* empty body → legacy env-priced checkout */ }
    return json(await createCheckout(customerId, email, appBaseUrl, planId, autoRenew, couponCode));
});
