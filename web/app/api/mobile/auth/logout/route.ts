import { mobileWrap, mobileOk } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';

// POST /api/mobile/auth/logout — stateless JWT, so the client discards the token
export const POST = mobileWrap(async (request) => {
    requireCustomer(request); // validate the token before acknowledging
    return mobileOk({ message: 'Logged out successfully' });
});
