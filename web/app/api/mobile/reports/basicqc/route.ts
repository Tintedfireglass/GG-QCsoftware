import { mobileWrap, mobileOk, parseMobileBody } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';
import { clientIp } from '@/lib/http/handler';
import { fullQcSchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { submitBasicQc } from '@/lib/platforms/android/services/mobile-reports.service';

// POST /api/mobile/reports/basicqc — standalone Basic QC sweep.
// Same payload as fullqc; stored with reportType = BASIC_QC.
export const POST = mobileWrap(async (request) => {
    const { customerId } = requireCustomer(request);
    const body = await parseMobileBody(request, fullQcSchema);
    const r = await submitBasicQc({ customerId, ip: clientIp(request) }, body);
    return mobileOk({ data: r.data, status: 201 });
});
