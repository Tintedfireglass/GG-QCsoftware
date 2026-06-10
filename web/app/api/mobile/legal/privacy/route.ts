import { mobileWrap, mobileOk } from '@/lib/platforms/android/http';
import { getPrivacyContent } from '@/lib/shared/services/legal.service';

// GET /api/mobile/legal/privacy — backend-driven Privacy Policy only.
// Public (no auth): the in-app WebView loads this before login.
export const GET = mobileWrap(async () => {
    const privacy = await getPrivacyContent();
    return mobileOk({ data: privacy });
});
