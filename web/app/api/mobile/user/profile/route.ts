import { mobileWrap, mobileOk, parseMobileBody } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';
import { updateProfileSchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { getProfile, updateProfile } from '@/lib/platforms/android/services/mobile-auth.service';

// GET /api/mobile/user/profile — current user's profile
export const GET = mobileWrap(async (request) => {
    const { customerId } = requireCustomer(request);
    const r = await getProfile(customerId);
    return mobileOk({ data: r.data });
});

// PUT /api/mobile/user/profile — update profile fields
export const PUT = mobileWrap(async (request) => {
    const { customerId } = requireCustomer(request);
    const body = await parseMobileBody(request, updateProfileSchema);
    const r = await updateProfile(customerId, body);
    return mobileOk({ message: r.message, data: r.data });
});
