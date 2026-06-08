import { mobileWrap, mobileOk, parseMobileQuery } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';
import { licenseStatusQuerySchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { status } from '@/lib/platforms/android/services/mobile-license.service';

// GET /api/mobile/license/status — entitlement for the signed-in customer
export const GET = mobileWrap(async (request) => {
    const { customerId } = requireCustomer(request);
    const { deviceId } = parseMobileQuery(request, licenseStatusQuerySchema);
    const r = await status(customerId, deviceId);
    return mobileOk({ data: r.data });
});
