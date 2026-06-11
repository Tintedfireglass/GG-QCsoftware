import { mobileWrap, mobileOk, parseMobileBody } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';
import { clientIp } from '@/lib/http/handler';
import { displayReportSchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { submitDisplay } from '@/lib/platforms/android/services/mobile-reports.service';

// POST /api/mobile/reports/test/display
export const POST = mobileWrap(async (request) => {
    const { customerId } = requireCustomer(request);
    const body = await parseMobileBody(request, displayReportSchema);
    const r = await submitDisplay({ customerId, ip: clientIp(request) }, body);
    return mobileOk({ data: r.data, status: 201 });
});
