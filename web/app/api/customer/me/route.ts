import { wrap, json } from '@/lib/http/handler';
import { requireCustomer } from '@/lib/http/customer-auth';
import { getProfile } from '@/lib/services/customer.service';

// GET /api/customer/me - current B2C customer profile
export const GET = wrap(async (request) => {
    const { customerId } = requireCustomer(request);
    return json(await getProfile(customerId));
});
