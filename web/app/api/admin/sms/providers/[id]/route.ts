import { withAuth, json } from '@/lib/http/handler';
import * as sms from '@/lib/shared/services/sms-settings.service';

export const PATCH = withAuth(['SuperAdmin'], async (request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return json({ error: 'Invalid provider ID' }, { status: 400 });

    const body = await request.json();

    // Activate (deactivates all others)
    if (body.activate === true) {
        const provider = await sms.activateProvider(id);
        return json({ provider: { id: provider.id, provider: provider.provider, isActive: provider.isActive } });
    }

    // Edit credentials / config (blank secret fields keep existing values)
    if (body.config && typeof body.config === 'object') {
        const existing = (await sms.listProviders()).find((p) => p.id === id);
        if (!existing) return json({ error: 'SMS provider not found' }, { status: 404 });
        const saved = await sms.saveProvider(
            existing.provider,
            body.config,
            typeof body.isActive === 'boolean' ? body.isActive : existing.isActive
        );
        return json({ provider: { id: saved.id, provider: saved.provider, isActive: saved.isActive } });
    }

    return json({ error: 'Invalid operation' }, { status: 400 });
});

export const DELETE = withAuth(['SuperAdmin'], async (request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return json({ error: 'Invalid provider ID' }, { status: 400 });
    await sms.deleteProvider(id);
    return json({ success: true });
});
