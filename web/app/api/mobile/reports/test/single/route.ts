import { mobileWrap, mobileOk, parseMobileBody } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';
import { clientIp } from '@/lib/http/handler';
import { singleTestSchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { submitSingle } from '@/lib/platforms/android/services/mobile-reports.service';

// POST /api/mobile/reports/test/single — generic single-test (BLUETOOTH/WIFI/GPS/...)
export const POST = mobileWrap(async (request) => {
    const { customerId } = requireCustomer(request);
    const body = await parseMobileBody(request, singleTestSchema);
    const r = await submitSingle({ customerId, ip: clientIp(request) }, body);
    return mobileOk({ data: r.data, status: 201 });
});
