import { withAuth, json } from '@/lib/http/handler';
import * as settings from '@/lib/shared/services/settings.service';
import { invalidateBrandingCache } from '@/lib/shared/services/branding.service';

export const GET = withAuth(['SuperAdmin'], async () => {
    return json({ settings: await settings.getGeneralSettings() });
});

export const PUT = withAuth(['SuperAdmin'], async (request) => {
    const body = await request.json();
    const updated = await settings.updateGeneralSettings(body || {});
    // siteName / verifyBaseUrl feed the branding cache read on every render.
    invalidateBrandingCache();
    return json({ settings: updated });
});
