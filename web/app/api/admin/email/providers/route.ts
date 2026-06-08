import { withAuth, json } from '@/lib/http/handler';
import * as email from '@/lib/shared/services/email-settings.service';

export const GET = withAuth(['SuperAdmin'], async () => {
    return json({ providers: await email.listProviders() });
});

export const POST = withAuth(['SuperAdmin'], async (request) => {
    const body = await request.json();
    const { provider, config, isActive } = body || {};
    if (!provider || typeof provider !== 'string') {
        return json({ error: 'Provider is required' }, { status: 400 });
    }
    const saved = await email.saveProvider(provider, config || {}, isActive === true);
    return json({ provider: { id: saved.id, provider: saved.provider, isActive: saved.isActive } }, { status: 201 });
});
