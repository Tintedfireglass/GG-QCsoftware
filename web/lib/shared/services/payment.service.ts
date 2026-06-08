import * as repo from '@/lib/shared/repositories/payment-gateway.repo';
import * as customerRepo from '@/lib/shared/repositories/customer.repo';
import { createPaymentGateway, resolveGatewayCredentials } from '@/lib/shared/payment/gateway.factory';
import { IPaymentGateway, WebhookEvent } from '@/lib/shared/payment/gateway.interface';
import { ValidationError, NotFoundError, ConflictError } from '@/lib/http/errors';
import { logger } from '@/lib/logger';

export async function getActivePaymentGateway(): Promise<IPaymentGateway | null> {
    const config = await repo.getActiveGateway();
    if (!config) return null;
    return createPaymentGateway(config);
}

export async function createPaymentCheckout(params: {
    orderId: number;
    amountCents: number;
    currency: string;
    customerEmail: string;
    callbackUrl: string;
    state: string;
    recurring?: boolean;
}) {
    const gateway = await getActivePaymentGateway();
    if (!gateway) {
        throw new Error('No active payment gateway configured');
    }
    return gateway.createCheckoutSession(params);
}

/** Read the saved mandate (customer + token) from a first authorization payment. */
export async function fetchSavedMandate(gatewayPaymentRef: string) {
    const gateway = await getActivePaymentGateway();
    if (!gateway) return null;
    return gateway.fetchSavedMandate(gatewayPaymentRef);
}

/** Charge a saved mandate for an auto-renewal. */
export async function chargeRecurring(params: {
    customerRef: string;
    tokenRef: string;
    amountCents: number;
    currency: string;
    customerEmail: string;
    description?: string;
}) {
    const gateway = await getActivePaymentGateway();
    if (!gateway) throw new Error('No active payment gateway configured');
    return gateway.chargeRecurring(params);
}

export async function verifyPaymentCallback(body: any, headers: any) {
    const gateway = await getActivePaymentGateway();
    if (!gateway) {
        throw new Error('No active payment gateway configured');
    }
    return gateway.verifyCallback(body, headers);
}

/**
 * Verify an inbound webhook, then dedup it against payment_webhook_events.
 * Returns the normalized event plus `duplicate` so callers can no-op replays.
 */
export async function verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<{ event: WebhookEvent; provider: string; duplicate: boolean }> {
    const config = await repo.getActiveGateway();
    if (!config) throw new Error('No active payment gateway configured');
    const gateway = createPaymentGateway(config);
    const event = await gateway.verifyWebhook(rawBody, headers);

    let duplicate = false;
    if ((event.status === 'success' || event.status === 'failed') && event.eventId) {
        const isNew = await repo.recordWebhookEvent(config.provider, event.eventId, event.type);
        duplicate = !isNew;
    }
    return { event, provider: config.provider, duplicate };
}

function setHasKey(config: Record<string, any>, mode: 'test' | 'live'): boolean {
    const set = config?.[mode];
    if (set && typeof set.keyId === 'string' && set.keyId) return true;
    // Legacy flat config counts toward whichever mode its prefix implies.
    if (typeof config?.keyId === 'string') {
        return mode === 'live' ? config.keyId.startsWith('rzp_live_') : config.keyId.startsWith('rzp_test_');
    }
    return false;
}

export async function listGateways() {
    const gateways = await repo.getAllGateways();
    return gateways.map((g) => {
        const cfg = (g.config as Record<string, any>) || {};
        const creds = resolveGatewayCredentials(cfg);
        return {
            id: g.id,
            provider: g.provider,
            isActive: g.isActive,
            hasConfig: !!g.config,
            createdAt: g.createdAt,
            mode: creds.mode,
            keyMode: creds.mode, // back-compat field name for the UI badge
            hasTestKeys: setHasKey(cfg, 'test'),
            hasLiveKeys: setHasKey(cfg, 'live'),
            hasWebhookSecret: !!creds.webhookSecret,
        };
    });
}

export async function saveGateway(provider: string, config: Record<string, any>, isActive: boolean) {
    return repo.upsertGateway(provider, config, isActive);
}

/**
 * Merge new config values into an existing gateway's config (partial edit).
 * Handles the nested test/live key sets: blank fields keep the existing value
 * so secrets are never wiped by an empty edit.
 */
export async function updateGatewayConfig(id: number, partialConfig: Record<string, any>, isActive?: boolean) {
    const existing = (await repo.getAllGateways()).find((g) => g.id === id);
    if (!existing) throw new NotFoundError('Gateway not found');

    const cur = (existing.config as Record<string, any>) || {};
    const next: Record<string, any> = { ...cur };

    if (partialConfig.mode === 'test' || partialConfig.mode === 'live') next.mode = partialConfig.mode;
    if (typeof partialConfig.displayName === 'string' && partialConfig.displayName !== '') next.displayName = partialConfig.displayName;

    for (const m of ['test', 'live'] as const) {
        const inSet = partialConfig[m];
        if (inSet && typeof inSet === 'object') {
            const curSet = cur[m] && typeof cur[m] === 'object' ? cur[m] : {};
            const mergedSet: Record<string, any> = { ...curSet };
            for (const f of ['keyId', 'keySecret', 'webhookSecret']) {
                if (typeof inSet[f] === 'string' && inSet[f] !== '') mergedSet[f] = inSet[f];
            }
            next[m] = mergedSet;
        }
    }

    return repo.upsertGateway(existing.provider, next, isActive ?? existing.isActive);
}

/** Switch which key set (test/live) a gateway uses, without editing keys. */
export async function setGatewayMode(id: number, mode: 'test' | 'live') {
    const existing = (await repo.getAllGateways()).find((g) => g.id === id);
    if (!existing) throw new NotFoundError('Gateway not found');
    const next = { ...((existing.config as Record<string, any>) || {}), mode };
    return repo.upsertGateway(existing.provider, next, existing.isActive);
}

export async function activateGateway(id: number) {
    return repo.setActiveGateway(id);
}

export async function removeGateway(id: number) {
    return repo.deleteGateway(id);
}

/** Refund a paid order through the active gateway and reflect it locally. */
export async function refundOrder(orderId: number): Promise<{ orderId: number; refundRef?: string }> {
    if (!Number.isInteger(orderId) || orderId <= 0) throw new ValidationError('Invalid order id');

    const order = await customerRepo.findOrderById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.status === 'refunded') throw new ConflictError('Order already refunded');
    if (order.status !== 'paid') throw new ValidationError('Only paid orders can be refunded');
    if (!order.gateway_reference) throw new ValidationError('Order has no gateway payment reference to refund');

    const gateway = await getActivePaymentGateway();
    if (!gateway) throw new Error('No active payment gateway configured');

    const result = await gateway.refund({
        gatewayPaymentRef: order.gateway_reference,
        amountCents: order.amount_cents,
        notes: { order_id: String(orderId) },
    });
    if (!result.success) {
        logger.error('payment.refund.failed', { orderId, message: result.errorMessage });
        throw new ValidationError(result.errorMessage || 'Refund failed at gateway');
    }

    await customerRepo.markOrderRefunded(orderId, order.generated_license_key_id);
    logger.info('payment.refund.success', { orderId, refundRef: result.refundRef });
    return { orderId, refundRef: result.refundRef };
}
