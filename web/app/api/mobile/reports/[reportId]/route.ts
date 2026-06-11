import { mobileWrap, mobileOk } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';
import { getReport } from '@/lib/platforms/android/services/mobile-reports.service';

// GET /api/mobile/reports/:reportId — full report (original payload + identifiers).
// Static siblings (history, fullqc, stress, test) take routing precedence.
export const GET = mobileWrap(async (request, { params }) => {
    const { customerId } = requireCustomer(request);
    const r = await getReport(customerId, params.reportId);
    return mobileOk({ data: r.data });
});
