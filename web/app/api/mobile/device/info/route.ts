import { mobileWrap, mobileOk, parseMobileBody } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';
import { deviceInfoSchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { saveDeviceInfo } from '@/lib/platforms/android/services/mobile-device.service';

// POST /api/mobile/device/info — upsert device hardware snapshot
export const POST = mobileWrap(async (request) => {
    const { customerId } = requireCustomer(request);
    const body = await parseMobileBody(request, deviceInfoSchema);
    const r = await saveDeviceInfo(customerId, body);
    return mobileOk({ message: r.message, data: r.data, status: 201 });
});
