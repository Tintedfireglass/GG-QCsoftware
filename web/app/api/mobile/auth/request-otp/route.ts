import { mobileWrap, mobileOk, parseMobileBody } from '@/lib/platforms/android/http';
import { requestOtpSchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { requestOtp } from '@/lib/platforms/android/services/mobile-auth.service';

// POST /api/mobile/auth/request-otp — send a login OTP to a phone number
export const POST = mobileWrap(async (request) => {
    const { phone, countryCode } = await parseMobileBody(request, requestOtpSchema);
    const r = await requestOtp(phone, countryCode);
    return mobileOk({ message: r.message, data: r.data });
});
