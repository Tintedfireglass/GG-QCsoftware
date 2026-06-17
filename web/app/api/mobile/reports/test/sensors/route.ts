import { mobileWrap, mobileOk, parseMobileBody } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';
import { clientIp } from '@/lib/http/handler';
import { sensorsReportSchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { submitSensors } from '@/lib/platforms/android/services/mobile-reports.service';

// POST /api/mobile/reports/test/sensors
export const POST = mobileWrap(async (request) => {
    const { customerId } = requireCustomer(request);
    const body = await parseMobileBody(request, sensorsReportSchema);
    const r = await submitSensors({ customerId, ip: clientIp(request) }, body);
    return mobileOk({ data: r.data, status: 201 });
});
