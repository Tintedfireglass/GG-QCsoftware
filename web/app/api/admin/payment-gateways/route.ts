import { withAuth, json } from '@/lib/http/handler';
import * as paymentService from '@/lib/shared/services/payment.service';

export const GET = withAuth(['SuperAdmin'], async (request) => {
    const gateways = await paymentService.listGateways();
    return json({ gateways });
});

export const POST = withAuth(['SuperAdmin'], async (request) => {
    const body = await request.json();
    const { provider, config, isActive } = body;

    if (!provider || typeof provider !== 'string') {
        return json({ error: 'Provider is required' }, { status: 400 });
    }
    const SUPPORTED_PROVIDERS = ['razorpay'];
    if (!SUPPORTED_PROVIDERS.includes(provider.toLowerCase())) {
        return json({ error: `Unsupported provider. Supported: ${SUPPORTED_PROVIDERS.join(', ')}` }, { status: 400 });
    }
    if (!config || typeof config !== 'object') {
        return json({ error: 'Config is required' }, { status: 400 });
    }

    const gateway = await paymentService.saveGateway(
        provider.toLowerCase(),
        config,
        isActive === true
    );

    return json({ gateway: {
        id: gateway.id,
        provider: gateway.provider,
        isActive: gateway.isActive
    }}, { status: 201 });
});
