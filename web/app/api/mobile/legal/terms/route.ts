import { mobileWrap, mobileOk } from '@/lib/platforms/android/http';
import { getTermsContent } from '@/lib/shared/services/legal.service';

// GET /api/mobile/legal/terms — backend-driven Terms & Conditions only.
// Public (no auth): the in-app WebView loads this before login.
export const GET = mobileWrap(async () => {
    const terms = await getTermsContent();
    return mobileOk({ data: terms });
});
