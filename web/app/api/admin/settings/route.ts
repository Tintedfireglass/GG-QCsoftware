import { withAuth, json } from '@/lib/http/handler';
import * as settings from '@/lib/shared/services/settings.service';

export const GET = withAuth(['SuperAdmin'], async () => {
    return json({ settings: await settings.getGeneralSettings() });
});

export const PUT = withAuth(['SuperAdmin'], async (request) => {
    const body = await request.json();
    const updated = await settings.updateGeneralSettings(body || {});
    return json({ settings: updated });
});
