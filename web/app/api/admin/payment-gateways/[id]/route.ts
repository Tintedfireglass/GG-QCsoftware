import { withAuth, json } from '@/lib/http/handler';
import * as paymentService from '@/lib/shared/services/payment.service';

export const PATCH = withAuth(['SuperAdmin'], async (request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) {
        return json({ error: 'Invalid gateway ID' }, { status: 400 });
    }

    const body = await request.json();

    // Activate
    if (body.activate === true) {
        const gateway = await paymentService.activateGateway(id);
        return json({ gateway: {
            id: gateway.id,
            provider: gateway.provider,
            isActive: gateway.isActive
        }});
    }

    // Switch test/live mode without editing keys
    if (body.mode === 'test' || body.mode === 'live') {
        const gateway = await paymentService.setGatewayMode(id, body.mode);
        return json({ gateway: {
            id: gateway.id,
            provider: gateway.provider,
            isActive: gateway.isActive
        }});
    }

    // Edit credentials / config (partial merge; blank fields are ignored)
    if (body.config && typeof body.config === 'object') {
        const gateway = await paymentService.updateGatewayConfig(
            id,
            body.config,
            typeof body.isActive === 'boolean' ? body.isActive : undefined
        );
        return json({ gateway: {
            id: gateway.id,
            provider: gateway.provider,
            isActive: gateway.isActive
        }});
    }

    return json({ error: 'Invalid operation' }, { status: 400 });
});

export const DELETE = withAuth(['SuperAdmin'], async (request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) {
        return json({ error: 'Invalid gateway ID' }, { status: 400 });
    }

    await paymentService.removeGateway(id);
    return json({ success: true });
});
