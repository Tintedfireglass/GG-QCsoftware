import { mobileWrap, mobileOk, parseMobileQuery } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';
import { supportListQuerySchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { listMyTickets } from '@/lib/platforms/android/services/mobile-support.service';

// GET /api/mobile/support/tickets — the customer's own tickets (paginated).
export const GET = mobileWrap(async (request) => {
    const { customerId } = requireCustomer(request);
    const query = parseMobileQuery(request, supportListQuerySchema);
    const r = await listMyTickets(customerId, query);
    return mobileOk({ data: r.data });
});
