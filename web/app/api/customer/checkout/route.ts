import { wrap, json } from '@/lib/http/handler';
import { requireCustomer } from '@/lib/http/customer-auth';
import { createCheckout } from '@/lib/services/customer.service';

// POST /api/customer/checkout - create a one-time purchase checkout session
export const POST = wrap(async (request) => {
    const { customerId, email } = requireCustomer(request);
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    return json(await createCheckout(customerId, email, appBaseUrl));
});
