import { IPaymentGateway, PaymentGatewayConfig } from './gateway.interface';
import { RazorpayGateway } from './razorpay.gateway';

export interface ResolvedCredentials {
    mode: 'test' | 'live';
    keyId?: string;
    keySecret?: string;
    webhookSecret?: string;
    displayName?: string;
}

/**
 * Resolve the active credential set from a gateway config that may hold BOTH a
 * `test` and a `live` key set plus a `mode` selector. Falls back to the legacy
 * flat shape ({ keyId, keySecret, webhookSecret }) for configs saved before
 * the test/live split.
 */
export function resolveGatewayCredentials(config: Record<string, any> | null | undefined): ResolvedCredentials {
    const c = config || {};
    const hasTest = !!(c.test && c.test.keyId);
    const hasLive = !!(c.live && c.live.keyId);

    const mode: 'test' | 'live' =
        c.mode === 'live' || c.mode === 'test' ? c.mode
        : hasLive && !hasTest ? 'live'
        : hasTest ? 'test'
        : typeof c.keyId === 'string' && c.keyId.startsWith('rzp_live_') ? 'live'
        : 'test';

    const set = mode === 'live' ? c.live : c.test;
    if (set && set.keyId) {
        return { mode, keyId: set.keyId, keySecret: set.keySecret, webhookSecret: set.webhookSecret, displayName: c.displayName };
    }
    // Legacy flat config.
    return { mode, keyId: c.keyId, keySecret: c.keySecret, webhookSecret: c.webhookSecret, displayName: c.displayName };
}

export function createPaymentGateway(config: PaymentGatewayConfig): IPaymentGateway {
    switch (config.provider.toLowerCase()) {
        case 'razorpay': {
            const creds = resolveGatewayCredentials(config.config);
            return new RazorpayGateway({
                keyId: creds.keyId || '',
                keySecret: creds.keySecret || '',
                webhookSecret: creds.webhookSecret,
                displayName: creds.displayName,
            });
        }
        default:
            throw new Error(`Unsupported payment gateway: ${config.provider}`);
    }
}
