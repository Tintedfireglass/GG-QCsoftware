import { mobileWrap, mobileOk, parseMobileBody } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';
import { clientIp } from '@/lib/http/handler';
import { stressReportSchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { submitStress } from '@/lib/platforms/android/services/mobile-reports.service';

// POST /api/mobile/reports/stress — stress test report (+ perfGraph samples)
export const POST = mobileWrap(async (request) => {
    const { customerId } = requireCustomer(request);
    const body = await parseMobileBody(request, stressReportSchema);
    const r = await submitStress({ customerId, ip: clientIp(request) }, body);
    return mobileOk({ data: r.data, status: 201 });
});
