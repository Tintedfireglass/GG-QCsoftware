import { mobileWrap, mobileOk } from '@/lib/platforms/android/http';
import { getLegalContent } from '@/lib/shared/services/legal.service';

// GET /api/mobile/legal — backend-driven Terms & Conditions + Privacy Policy.
// Public (no auth): the in-app WebView loads this before login.
export const GET = mobileWrap(async () => {
    const legal = await getLegalContent();
    return mobileOk({ data: legal });
});
