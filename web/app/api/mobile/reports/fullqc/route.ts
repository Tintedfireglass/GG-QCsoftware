import { mobileWrap, mobileOk, parseMobileBody } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';
import { clientIp } from '@/lib/http/handler';
import { fullQcSchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { submitFullQc } from '@/lib/platforms/android/services/mobile-reports.service';

// POST /api/mobile/reports/fullqc — complete Full QC summary (13 tests)
export const POST = mobileWrap(async (request) => {
    const { customerId } = requireCustomer(request);
    const body = await parseMobileBody(request, fullQcSchema);
    const r = await submitFullQc({ customerId, ip: clientIp(request) }, body);
    return mobileOk({ data: r.data, status: 201 });
});
