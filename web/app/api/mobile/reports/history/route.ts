import { mobileWrap, mobileOk, parseMobileQuery } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';
import { historyQuerySchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { getHistory } from '@/lib/platforms/android/services/mobile-reports.service';

// GET /api/mobile/reports/history — paginated report list (filters: type, deviceId)
export const GET = mobileWrap(async (request) => {
    const { customerId } = requireCustomer(request);
    const query = parseMobileQuery(request, historyQuerySchema);
    const r = await getHistory(customerId, query);
    return mobileOk({ data: r.data });
});
