import { mobileWrap, mobileOk, parseMobileBody } from '@/lib/platforms/android/http';
import { verifyOtpSchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { verifyOtp } from '@/lib/platforms/android/services/mobile-auth.service';

// POST /api/mobile/auth/verify-otp — verify OTP, create-or-login, return a token
export const POST = mobileWrap(async (request) => {
    const body = await parseMobileBody(request, verifyOtpSchema);
    const r = await verifyOtp(body);
    return mobileOk({ data: r.data });
});
