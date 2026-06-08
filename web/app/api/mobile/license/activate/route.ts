import { mobileWrap, mobileOk, parseMobileBody } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';
import { licenseActivateSchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { activate } from '@/lib/platforms/android/services/mobile-license.service';

// POST /api/mobile/license/activate — redeem a license key for this device
export const POST = mobileWrap(async (request) => {
    const { customerId } = requireCustomer(request);
    const { key, deviceId } = await parseMobileBody(request, licenseActivateSchema);
    const r = await activate(customerId, key, deviceId);
    return mobileOk({ message: r.message, data: r.data });
});
