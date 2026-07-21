import crypto from 'crypto';
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

interface RazorpayConfig {
    keyId: string;
    keySecret: string;
    /** Optional webhook signing secret (Razorpay Dashboard → Webhooks). */
    webhookSecret?: string;
    /** Display name shown on the Razorpay checkout. */
    displayName?: string;
}

const RAZORPAY_API = 'https://api.razorpay.com/v1';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export class RazorpayGateway implements IPaymentGateway {
    private config: RazorpayConfig;

    constructor(config: RazorpayConfig) {
        if (!config.keyId || !config.keySecret) {
            throw new Error('Razorpay gateway misconfigured: keyId and keySecret are required');
        }
        this.config = config;
    }

    private authHeader(): string {
        return `Basic ${Buffer.from(`${this.config.keyId}:${this.config.keySecret}`).toString('base64')}`;
    }

    /** fetch with timeout + retry on network/5xx errors, surfacing API error bodies. */
    private async apiFetch(path: string, init: RequestInit): Promise<any> {
        let lastErr: unknown;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
            try {
                const res = await fetch(`${RAZORPAY_API}${path}`, {
                    ...init,
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': this.authHeader(),
                        ...(init.headers || {}),
                    },
                });
                const text = await res.text();
                let parsed: any = null;
                try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }

                if (!res.ok) {
                    const apiMsg = parsed?.error?.description || parsed?.error?.reason || text || res.statusText;
                    // Retry only on transient server errors; 4xx are deterministic.
                    if (res.status >= 500 && attempt < MAX_RETRIES) {
                        lastErr = new Error(`Razorpay ${res.status}: ${apiMsg}`);
                        logger.warn('razorpay.api.retry', { path, status: res.status, attempt });
                        continue;
                    }
                    throw new Error(`Razorpay API error (${res.status}): ${apiMsg}`);
                }
                return parsed;
            } catch (err) {
                lastErr = err;
                const isAbort = err instanceof Error && err.name === 'AbortError';
                if (attempt < MAX_RETRIES && (isAbort || err instanceof TypeError)) {
                    logger.warn('razorpay.api.retry', { path, attempt, reason: isAbort ? 'timeout' : 'network' });
                    continue;
                }
                throw err;
            } finally {
                clearTimeout(timer);
            }
        }
        throw lastErr instanceof Error ? lastErr : new Error('Razorpay API request failed');
    }

    keyMode(): 'live' | 'test' | 'unknown' {
        if (this.config.keyId.startsWith('rzp_live_')) return 'live';
        if (this.config.keyId.startsWith('rzp_test_')) return 'test';
        return 'unknown';
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
        // For auto-renewal we must register a reusable mandate, which Razorpay ties
        // to a customer + a `token` registration on the first (authorization) order.
        let customerId: string | null = null;
        if (params.recurring) {
            const customer = await this.apiFetch('/customers', {
                method: 'POST',
                body: JSON.stringify({ email: params.customerEmail, fail_existing: 0 }),
            });
            customerId = customer?.id ?? null;
            if (!customerId) throw new Error('Razorpay did not return a customer id');
        }

        const order = await this.apiFetch('/orders', {
            method: 'POST',
            body: JSON.stringify({
                amount: params.amountCents,
                currency: params.currency,
                receipt: `order_${params.orderId}`,
                ...(params.recurring
                    ? {
                          // Register the first payment as the mandate authorization.
                          customer_id: customerId,
                          method: 'card',
                          token: { max_amount: Math.max(params.amountCents * 10, params.amountCents), frequency: 'as_presented' },
                      }
                    : {}),
                notes: {
                    state: params.state,
                    customer_email: params.customerEmail,
                },
            }),
        });

        if (!order?.id) {
            throw new Error('Razorpay did not return an order id');
        }

        const redirectUrl = new URL(params.callbackUrl.replace('/callback', '/razorpay'));
        redirectUrl.searchParams.set('order_id', order.id);
        redirectUrl.searchParams.set('key_id', this.config.keyId);
        redirectUrl.searchParams.set('amount', String(params.amountCents));
        redirectUrl.searchParams.set('currency', params.currency);
        redirectUrl.searchParams.set('name', this.config.displayName || `${(await getBranding()).siteName} License`);
        redirectUrl.searchParams.set('prefill_email', params.customerEmail);
        redirectUrl.searchParams.set('state', params.state);
        redirectUrl.searchParams.set('callback_url', params.callbackUrl);
        if (params.recurring && customerId) {
            redirectUrl.searchParams.set('customer_id', customerId);
            redirectUrl.searchParams.set('recurring', '1');
        }

        return { redirectUrl: redirectUrl.toString(), paymentId: order.id };
    }

    /** Read the token + customer registered by the first authorization payment. */
    async fetchSavedMandate(gatewayPaymentRef: string): Promise<SavedMandate | null> {
        try {
            const payment = await this.apiFetch(`/payments/${encodeURIComponent(gatewayPaymentRef)}`, { method: 'GET' });
            const tokenRef = payment?.token_id ?? null;
            const customerRef = payment?.customer_id ?? null;
            if (!tokenRef || !customerRef) return null;
            return { customerRef, tokenRef };
        } catch (err) {
            logger.error('razorpay.fetchMandate.failed', { err, paymentRef: gatewayPaymentRef });
            return null;
        }
    }

    /** Charge a saved mandate server-to-server (no customer interaction). */
    async chargeRecurring(params: {
        customerRef: string;
        tokenRef: string;
        amountCents: number;
        currency: string;
        customerEmail: string;
        description?: string;
    }): Promise<RecurringChargeResult> {
        try {
            const order = await this.apiFetch('/orders', {
                method: 'POST',
                body: JSON.stringify({
                    amount: params.amountCents,
                    currency: params.currency,
                    payment_capture: true,
                    notes: { kind: 'auto_renewal' },
                }),
            });
            if (!order?.id) return { success: false, errorMessage: 'Razorpay did not return an order id' };

            const payment = await this.apiFetch('/payments/create/recurring', {
                method: 'POST',
                body: JSON.stringify({
                    email: params.customerEmail,
                    amount: params.amountCents,
                    currency: params.currency,
                    order_id: order.id,
                    customer_id: params.customerRef,
                    token: params.tokenRef,
                    recurring: '1',
                    ...(params.description ? { description: params.description } : {}),
                }),
            });

            const id = payment?.razorpay_payment_id ?? payment?.id ?? null;
            if (!id) return { success: false, errorMessage: 'Recurring charge did not return a payment id' };
            return { success: true, gatewayRef: id };
        } catch (err) {
            logger.error('razorpay.chargeRecurring.failed', { err });
            return { success: false, errorMessage: err instanceof Error ? err.message : 'Recurring charge failed' };
        }
    }

    async verifyCallback(body: any): Promise<PaymentCallbackData> {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return { status: 'failed', errorMessage: 'Missing payment verification data' };
        }

        const expectedSignature = crypto
            .createHmac('sha256', this.config.keySecret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (!this.safeEqual(expectedSignature, razorpay_signature)) {
            return { status: 'failed', errorMessage: 'Payment signature verification failed' };
        }

        return { status: 'success', paymentRef: razorpay_order_id, gatewayRef: razorpay_payment_id };
    }

    async verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent> {
        if (!this.config.webhookSecret) {
            return { eventId: null, type: null, state: null, status: 'failed', errorMessage: 'Webhook secret not configured' };
        }
        const signature = headers['x-razorpay-signature'] || headers['X-Razorpay-Signature'] || '';
        const expected = crypto.createHmac('sha256', this.config.webhookSecret).update(rawBody).digest('hex');
        if (!signature || !this.safeEqual(expected, signature)) {
            return { eventId: null, type: null, state: null, status: 'failed', errorMessage: 'Webhook signature verification failed' };
        }

        let event: any;
        try { event = JSON.parse(rawBody); } catch {
            return { eventId: null, type: null, state: null, status: 'failed', errorMessage: 'Invalid webhook payload' };
        }

        const type: string | null = event?.event ?? null;
        const payment = event?.payload?.payment?.entity;
        const eventId: string | null = payment?.id ?? event?.payload?.refund?.entity?.id ?? null;
        const state: string | null = payment?.notes?.state ?? null;

        if (type === 'payment.captured' || type === 'order.paid') {
            return {
                eventId,
                type,
                state,
                status: 'success',
                paymentRef: payment?.order_id ?? null,
                gatewayRef: payment?.id ?? null,
            };
        }
        if (type === 'payment.failed') {
            return {
                eventId,
                type,
                state,
                status: 'failed',
                paymentRef: payment?.order_id ?? null,
                gatewayRef: payment?.id ?? null,
                errorMessage: payment?.error_description ?? 'Payment failed',
            };
        }
        // Other events (refunds, disputes, …) are acknowledged but not acted on here.
        return { eventId, type, state, status: 'ignored' };
    }

    async refund(params: { gatewayPaymentRef: string; amountCents?: number; notes?: Record<string, string> }): Promise<RefundResult> {
        if (!params.gatewayPaymentRef) {
            return { success: false, errorMessage: 'Missing gateway payment reference' };
        }
        try {
            const refund = await this.apiFetch(`/payments/${encodeURIComponent(params.gatewayPaymentRef)}/refund`, {
                method: 'POST',
                body: JSON.stringify({
                    ...(params.amountCents ? { amount: params.amountCents } : {}),
                    ...(params.notes ? { notes: params.notes } : {}),
                }),
            });
            return { success: true, refundRef: refund?.id };
        } catch (err) {
            logger.error('razorpay.refund.failed', { err, paymentRef: params.gatewayPaymentRef });
            return { success: false, errorMessage: err instanceof Error ? err.message : 'Refund failed' };
        }
    }

    /** Constant-time comparison to avoid signature timing leaks. */
    private safeEqual(a: string, b: string): boolean {
        const ab = Buffer.from(a);
        const bb = Buffer.from(b);
        if (ab.length !== bb.length) return false;
        return crypto.timingSafeEqual(ab, bb);
    }
}
