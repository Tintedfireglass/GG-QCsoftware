import { wrap, json } from '@/lib/http/handler';
import { requireCustomer } from '@/lib/http/customer-auth';
import { listLicenses } from '@/lib/services/customer.service';

// GET /api/customer/licenses - license keys owned by the current customer
export const GET = wrap(async (request) => {
    const { customerId } = requireCustomer(request);
    return json(await listLicenses(customerId));
});
