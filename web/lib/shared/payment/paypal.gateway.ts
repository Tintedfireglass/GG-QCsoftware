import {
    IPaymentGateway,
    CheckoutSession,
    PaymentCallbackData,
    WebhookEvent,
    RefundResult,
    SavedMandate,
    RecurringChargeResult,
} from './gateway.interface';
import { logger } from '@/lib/logger';
import { getBranding } from '@/lib/shared/services/branding.service';

interface PayPalConfig {
    /** REST app Client ID. */
    keyId: string;
    /** REST app Client Secret. */
    keySecret: string;
    /** Webhook ID (Dashboard → Webhooks) — used to verify inbound events. */
    webhookSecret?: string;
    /** 'test' → sandbox, 'live' → production. */
    mode: 'test' | 'live';
    /** Brand name shown on the PayPal approval page. */
    displayName?: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

/** Currencies PayPal treats as having no decimal places. */
const ZERO_DECIMAL = new Set(['JPY', 'HUF', 'TWD']);

function formatAmount(cents: number, currency: string): string {
    const cur = currency.toUpperCase();
    if (ZERO_DECIMAL.has(cur)) return String(Math.round(cents));
    return (cents / 100).toFixed(2);
}

export class PayPalGateway implements IPaymentGateway {
    private config: PayPalConfig;
    private base: string;
    private token: { value: string; expiresAt: number } | null = null;

    constructor(config: PayPalConfig) {
        if (!config.keyId || !config.keySecret) {
            throw new Error('PayPal gateway misconfigured: client id and secret are required');
        }
        this.config = config;
        this.base = config.mode === 'live'
            ? 'https://api-m.paypal.com'
            : 'https://api-m.sandbox.paypal.com';
    }

    keyMode(): 'live' | 'test' | 'unknown' {
        return this.config.mode === 'live' ? 'live' : 'test';
    }

    private async accessToken(): Promise<string> {
        const now = Date.now();
        if (this.token && this.token.expiresAt > now + 30_000) return this.token.value;

        const auth = Buffer.from(`${this.config.keyId}:${this.config.keySecret}`).toString('base64');
        const data = await this.rawFetch('/v1/oauth2/token', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=client_credentials',
        });
        if (!data?.access_token) throw new Error('PayPal did not return an access token');
        this.token = { value: data.access_token, expiresAt: now + (Number(data.expires_in) || 300) * 1000 };
        return this.token.value;
    }

    /** Low-level fetch with timeout + retry; no bearer token injected. */
    private async rawFetch(path: string, init: RequestInit): Promise<any> {
        let lastErr: unknown;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
            try {
                const res = await fetch(`${this.base}${path}`, { ...init, signal: controller.signal });
                const text = await res.text();
                let parsed: any = null;
                try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }

                if (!res.ok) {
                    const apiMsg = parsed?.message || parsed?.error_description || text || res.statusText;
                    if (res.status >= 500 && attempt < MAX_RETRIES) {
                        lastErr = new Error(`PayPal ${res.status}: ${apiMsg}`);
                        logger.warn('paypal.api.retry', { path, status: res.status, attempt });
                        continue;
                    }
                    throw new Error(`PayPal API error (${res.status}): ${apiMsg}`);
                }
                return parsed;
            } catch (err) {
                lastErr = err;
                const isAbort = err instanceof Error && err.name === 'AbortError';
                if (attempt < MAX_RETRIES && (isAbort || err instanceof TypeError)) {
                    logger.warn('paypal.api.retry', { path, attempt, reason: isAbort ? 'timeout' : 'network' });
                    continue;
                }
                throw err;
            } finally {
                clearTimeout(timer);
            }
        }
        throw lastErr instanceof Error ? lastErr : new Error('PayPal API request failed');
    }

    /** Authenticated JSON call (obtains + attaches a bearer token). */
    private async apiFetch(path: string, init: RequestInit): Promise<any> {
        const token = await this.accessToken();
        return this.rawFetch(path, {
            ...init,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...(init.headers || {}),
            },
        });
    }

    async createCheckoutSession(params: {
        orderId: number;
        amountCents: number;
        currency: string;
        customerEmail: string;
        callbackUrl: string;
        state: string;
        recurring?: boolean;
    }): Promise<CheckoutSession> {
        const returnUrl = new URL(params.callbackUrl);
        returnUrl.searchParams.set('gateway', 'paypal');
        returnUrl.searchParams.set('state', params.state);

        const cancelUrl = new URL(params.callbackUrl);
        cancelUrl.searchParams.set('gateway', 'paypal');
        cancelUrl.searchParams.set('state', params.state);
        cancelUrl.searchParams.set('status', 'cancelled');

        const order = await this.apiFetch('/v2/checkout/orders', {
            method: 'POST',
            body: JSON.stringify({
                intent: 'CAPTURE',
                purchase_units: [
                    {
                        reference_id: `order_${params.orderId}`,
                        custom_id: params.state,
                        amount: {
                            currency_code: params.currency.toUpperCase(),
                            value: formatAmount(params.amountCents, params.currency),
                        },
                    },
                ],
                application_context: {
                    brand_name: this.config.displayName || `${(await getBranding()).siteName} License`,
                    user_action: 'PAY_NOW',
                    return_url: returnUrl.toString(),
                    cancel_url: cancelUrl.toString(),
                },
            }),
        });

        if (!order?.id) throw new Error('PayPal did not return an order id');
        const approve = Array.isArray(order.links)
            ? order.links.find((l: any) => l.rel === 'approve' || l.rel === 'payer-action')
            : null;
        if (!approve?.href) throw new Error('PayPal did not return an approval URL');

        return { redirectUrl: approve.href, paymentId: order.id };
    }

    /** PayPal one-time checkout has no reusable off-session mandate here. */
    async fetchSavedMandate(): Promise<SavedMandate | null> {
        return null;
    }

    async chargeRecurring(): Promise<RecurringChargeResult> {
        return { success: false, errorMessage: 'Auto-renewal is not supported on PayPal; use Razorpay or Stripe for recurring plans.' };
    }

    /** Browser return from PayPal approval → capture the order to confirm payment. */
    async verifyCallback(body: any): Promise<PaymentCallbackData> {
        const orderId = body?.token; // PayPal appends ?token={orderId}&PayerID=…
        if (!orderId || typeof orderId !== 'string') {
            return { status: 'failed', errorMessage: 'Missing PayPal order token' };
        }
        try {
            const capture = await this.apiFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
                method: 'POST',
                body: '{}',
            });
            if (capture?.status !== 'COMPLETED') {
                return { status: 'failed', errorMessage: `Payment not completed (status: ${capture?.status ?? 'unknown'})` };
            }
            const captureId = capture?.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;
            return { status: 'success', paymentRef: orderId, gatewayRef: captureId ?? undefined };
        } catch (err) {
            // A previously-captured order returns 422 ORDER_ALREADY_CAPTURED — treat as unverifiable here;
            // the webhook path is authoritative for that case.
            logger.error('paypal.verifyCallback.failed', { err, orderId });
            return { status: 'failed', errorMessage: 'Unable to capture payment with PayPal' };
        }
    }

    async verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent> {
        if (!this.config.webhookSecret) {
            return { eventId: null, type: null, state: null, status: 'failed', errorMessage: 'Webhook id not configured' };
        }

        let event: any;
        try { event = JSON.parse(rawBody); } catch {
            return { eventId: null, type: null, state: null, status: 'failed', errorMessage: 'Invalid webhook payload' };
        }

        // PayPal verifies webhooks server-side via an API call rather than a local HMAC.
        let verified = false;
        try {
            const result = await this.apiFetch('/v1/notifications/verify-webhook-signature', {
                method: 'POST',
                body: JSON.stringify({
                    auth_algo: headers['paypal-auth-algo'],
                    cert_url: headers['paypal-cert-url'],
                    transmission_id: headers['paypal-transmission-id'],
                    transmission_sig: headers['paypal-transmission-sig'],
                    transmission_time: headers['paypal-transmission-time'],
                    webhook_id: this.config.webhookSecret,
                    webhook_event: event,
                }),
            });
            verified = result?.verification_status === 'SUCCESS';
        } catch (err) {
            logger.error('paypal.verifyWebhook.failed', { err });
        }
        if (!verified) {
            return { eventId: null, type: null, state: null, status: 'failed', errorMessage: 'Webhook signature verification failed' };
        }

        const type: string | null = event?.event_type ?? null;
        const resource = event?.resource ?? {};
        const eventId: string | null = event?.id ?? null;
        // custom_id carries our state; on capture events it's on the resource directly.
        const state: string | null =
            resource?.custom_id
            ?? resource?.purchase_units?.[0]?.custom_id
            ?? null;

        if (type === 'PAYMENT.CAPTURE.COMPLETED') {
            const orderId = Array.isArray(resource?.links)
                ? (resource.links.find((l: any) => l.rel === 'up')?.href?.split('/').pop() ?? null)
                : null;
            return { eventId, type, state, status: 'success', paymentRef: orderId, gatewayRef: resource?.id ?? null };
        }
        if (type === 'PAYMENT.CAPTURE.DENIED' || type === 'PAYMENT.CAPTURE.DECLINED') {
            return { eventId, type, state, status: 'failed', paymentRef: null, gatewayRef: resource?.id ?? null, errorMessage: 'Payment capture denied' };
        }
        return { eventId, type, state, status: 'ignored' };
    }

    async refund(params: { gatewayPaymentRef: string; amountCents?: number; notes?: Record<string, string> }): Promise<RefundResult> {
        if (!params.gatewayPaymentRef) {
            return { success: false, errorMessage: 'Missing gateway capture reference' };
        }
        try {
            // gatewayRef is the capture id recorded at payment time. An empty body
            // issues a full refund; partial refunds would need the capture's currency,
            // which the caller doesn't supply (it always refunds the full amount).
            const refund = await this.apiFetch(`/v2/payments/captures/${encodeURIComponent(params.gatewayPaymentRef)}/refund`, {
                method: 'POST',
                body: '{}',
            });
            return { success: true, refundRef: refund?.id };
        } catch (err) {
            logger.error('paypal.refund.failed', { err, paymentRef: params.gatewayPaymentRef });
            return { success: false, errorMessage: err instanceof Error ? err.message : 'Refund failed' };
        }
    }
}
