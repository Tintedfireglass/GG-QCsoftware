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

interface StripeConfig {
    /** Secret key (sk_live_… / sk_test_…) — used for all server-side API calls. */
    keySecret: string;
    /** Publishable key (pk_…) — not required server-side, kept for parity/UI. */
    keyId?: string;
    /** Webhook signing secret (whsec_…) from Stripe Dashboard → Webhooks. */
    webhookSecret?: string;
    /** Statement/checkout display name. */
    displayName?: string;
}

const STRIPE_API = 'https://api.stripe.com/v1';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
/** Stripe tolerance for webhook timestamp skew (seconds). */
const WEBHOOK_TOLERANCE_S = 300;

/** Encode a (possibly nested) object into Stripe's bracketed form syntax. */
function toFormPairs(obj: Record<string, any>, prefix = '', out: [string, string][] = []): [string, string][] {
    for (const [k, v] of Object.entries(obj)) {
        if (v === undefined || v === null) continue;
        const key = prefix ? `${prefix}[${k}]` : k;
        if (Array.isArray(v)) {
            v.forEach((item, i) => {
                if (item && typeof item === 'object') toFormPairs(item, `${key}[${i}]`, out);
                else out.push([`${key}[${i}]`, String(item)]);
            });
        } else if (v && typeof v === 'object') {
            toFormPairs(v, key, out);
        } else {
            out.push([key, String(v)]);
        }
    }
    return out;
}

function encodeForm(obj: Record<string, any>): string {
    return toFormPairs(obj)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
}

export class StripeGateway implements IPaymentGateway {
    private config: StripeConfig;

    constructor(config: StripeConfig) {
        if (!config.keySecret) {
            throw new Error('Stripe gateway misconfigured: secret key is required');
        }
        this.config = config;
    }

    /** fetch with timeout + retry on network/5xx errors, surfacing API error bodies. */
    private async apiFetch(path: string, init: RequestInit & { form?: Record<string, any> }): Promise<any> {
        const body = init.form ? encodeForm(init.form) : (init.body as BodyInit | undefined);
        let lastErr: unknown;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
            try {
                const res = await fetch(`${STRIPE_API}${path}`, {
                    ...init,
                    body,
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Bearer ${this.config.keySecret}`,
                        ...(init.headers || {}),
                    },
                });
                const text = await res.text();
                let parsed: any = null;
                try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }

                if (!res.ok) {
                    const apiMsg = parsed?.error?.message || text || res.statusText;
                    if (res.status >= 500 && attempt < MAX_RETRIES) {
                        lastErr = new Error(`Stripe ${res.status}: ${apiMsg}`);
                        logger.warn('stripe.api.retry', { path, status: res.status, attempt });
                        continue;
                    }
                    throw new Error(`Stripe API error (${res.status}): ${apiMsg}`);
                }
                return parsed;
            } catch (err) {
                lastErr = err;
                const isAbort = err instanceof Error && err.name === 'AbortError';
                if (attempt < MAX_RETRIES && (isAbort || err instanceof TypeError)) {
                    logger.warn('stripe.api.retry', { path, attempt, reason: isAbort ? 'timeout' : 'network' });
                    continue;
                }
                throw err;
            } finally {
                clearTimeout(timer);
            }
        }
        throw lastErr instanceof Error ? lastErr : new Error('Stripe API request failed');
    }

    keyMode(): 'live' | 'test' | 'unknown' {
        if (this.config.keySecret.startsWith('sk_live_') || this.config.keySecret.startsWith('rk_live_')) return 'live';
        if (this.config.keySecret.startsWith('sk_test_') || this.config.keySecret.startsWith('rk_test_')) return 'test';
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
        // Stripe replaces the literal {CHECKOUT_SESSION_ID} placeholder on redirect;
        // it must NOT be URL-encoded, so append it after the encoded query.
        const success = new URL(params.callbackUrl);
        success.searchParams.set('gateway', 'stripe');
        success.searchParams.set('state', params.state);
        const successUrl = `${success.toString()}&session_id={CHECKOUT_SESSION_ID}`;

        const cancel = new URL(params.callbackUrl);
        cancel.searchParams.set('gateway', 'stripe');
        cancel.searchParams.set('state', params.state);
        cancel.searchParams.set('status', 'cancelled');

        const form: Record<string, any> = {
            mode: 'payment',
            success_url: successUrl,
            cancel_url: cancel.toString(),
            customer_email: params.customerEmail,
            client_reference_id: params.state,
            'metadata': { state: params.state, order_id: params.orderId },
            'line_items': [
                {
                    quantity: 1,
                    'price_data': {
                        currency: params.currency.toLowerCase(),
                        'unit_amount': params.amountCents,
                        'product_data': { name: this.config.displayName || `${(await getBranding()).siteName} License` },
                    },
                },
            ],
            // Propagate state to the PaymentIntent so payment_intent.* webhooks carry it too.
            'payment_intent_data': { metadata: { state: params.state, order_id: params.orderId } },
        };

        if (params.recurring) {
            // Save the card to a new customer so it can be charged off-session later.
            form.customer_creation = 'always';
            form.payment_intent_data.setup_future_usage = 'off_session';
        }

        const session = await this.apiFetch('/checkout/sessions', { method: 'POST', form });
        if (!session?.id || !session?.url) {
            throw new Error('Stripe did not return a checkout session URL');
        }
        return { redirectUrl: session.url, paymentId: session.id };
    }

    /** After a successful checkout, read the saved customer + payment method. */
    async fetchSavedMandate(gatewayPaymentRef: string): Promise<SavedMandate | null> {
        try {
            // gatewayRef is the PaymentIntent id (stored at capture). Retrieve it to
            // read the attached customer + payment method for later off-session charges.
            const pi = await this.apiFetch(`/payment_intents/${encodeURIComponent(gatewayPaymentRef)}`, { method: 'GET' });
            const customerRef = pi?.customer ?? null;
            const tokenRef = pi?.payment_method ?? null;
            if (!customerRef || !tokenRef) return null;
            return { customerRef, tokenRef };
        } catch (err) {
            logger.error('stripe.fetchMandate.failed', { err, paymentRef: gatewayPaymentRef });
            return null;
        }
    }

    async chargeRecurring(params: {
        customerRef: string;
        tokenRef: string;
        amountCents: number;
        currency: string;
        customerEmail: string;
        description?: string;
    }): Promise<RecurringChargeResult> {
        try {
            const pi = await this.apiFetch('/payment_intents', {
                method: 'POST',
                form: {
                    amount: params.amountCents,
                    currency: params.currency.toLowerCase(),
                    customer: params.customerRef,
                    payment_method: params.tokenRef,
                    off_session: true,
                    confirm: true,
                    ...(params.description ? { description: params.description } : {}),
                    metadata: { kind: 'auto_renewal' },
                },
            });
            if (pi?.status !== 'succeeded') {
                return { success: false, errorMessage: `Recurring charge not completed (status: ${pi?.status ?? 'unknown'})` };
            }
            return { success: true, gatewayRef: pi.id };
        } catch (err) {
            logger.error('stripe.chargeRecurring.failed', { err });
            return { success: false, errorMessage: err instanceof Error ? err.message : 'Recurring charge failed' };
        }
    }

    /** Browser return from Stripe Checkout → confirm the session was actually paid. */
    async verifyCallback(body: any): Promise<PaymentCallbackData> {
        const sessionId = body?.session_id;
        if (!sessionId || typeof sessionId !== 'string') {
            return { status: 'failed', errorMessage: 'Missing Stripe session id' };
        }
        try {
            const session = await this.apiFetch(
                `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent`,
                { method: 'GET' }
            );
            if (session?.payment_status !== 'paid') {
                return { status: 'failed', errorMessage: `Payment not completed (status: ${session?.payment_status ?? 'unknown'})` };
            }
            const paymentIntentId = typeof session.payment_intent === 'object'
                ? session.payment_intent?.id
                : session.payment_intent;
            return { status: 'success', paymentRef: session.id, gatewayRef: paymentIntentId ?? undefined };
        } catch (err) {
            logger.error('stripe.verifyCallback.failed', { err, sessionId });
            return { status: 'failed', errorMessage: 'Unable to verify payment with Stripe' };
        }
    }

    async verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent> {
        if (!this.config.webhookSecret) {
            return { eventId: null, type: null, state: null, status: 'failed', errorMessage: 'Webhook secret not configured' };
        }
        const sigHeader = headers['stripe-signature'] || headers['Stripe-Signature'] || '';
        if (!this.verifySignature(rawBody, sigHeader)) {
            return { eventId: null, type: null, state: null, status: 'failed', errorMessage: 'Webhook signature verification failed' };
        }

        let event: any;
        try { event = JSON.parse(rawBody); } catch {
            return { eventId: null, type: null, state: null, status: 'failed', errorMessage: 'Invalid webhook payload' };
        }

        const type: string | null = event?.type ?? null;
        const object = event?.data?.object ?? {};
        const eventId: string | null = event?.id ?? null;
        const state: string | null = object?.metadata?.state ?? null;

        if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
            const paid = object?.payment_status === 'paid' || object?.payment_status === 'no_payment_required';
            return {
                eventId, type, state,
                status: paid ? 'success' : 'ignored',
                paymentRef: object?.id ?? null,
                gatewayRef: (typeof object?.payment_intent === 'string' ? object.payment_intent : object?.payment_intent?.id) ?? null,
            };
        }
        if (type === 'payment_intent.succeeded') {
            return {
                eventId, type, state,
                status: 'success',
                paymentRef: object?.id ?? null,
                gatewayRef: object?.id ?? null,
            };
        }
        if (type === 'payment_intent.payment_failed' || type === 'checkout.session.async_payment_failed') {
            return {
                eventId, type, state,
                status: 'failed',
                paymentRef: object?.id ?? null,
                gatewayRef: (typeof object?.payment_intent === 'string' ? object.payment_intent : object?.id) ?? null,
                errorMessage: object?.last_payment_error?.message ?? 'Payment failed',
            };
        }
        return { eventId, type, state, status: 'ignored' };
    }

    async refund(params: { gatewayPaymentRef: string; amountCents?: number; notes?: Record<string, string> }): Promise<RefundResult> {
        if (!params.gatewayPaymentRef) {
            return { success: false, errorMessage: 'Missing gateway payment reference' };
        }
        try {
            // gatewayRef is the PaymentIntent id captured at payment time.
            const refund = await this.apiFetch('/refunds', {
                method: 'POST',
                form: {
                    payment_intent: params.gatewayPaymentRef,
                    ...(params.amountCents ? { amount: params.amountCents } : {}),
                    ...(params.notes ? { metadata: params.notes } : {}),
                },
            });
            return { success: true, refundRef: refund?.id };
        } catch (err) {
            logger.error('stripe.refund.failed', { err, paymentRef: params.gatewayPaymentRef });
            return { success: false, errorMessage: err instanceof Error ? err.message : 'Refund failed' };
        }
    }

    /** Verify a Stripe `t=…,v1=…` signature header against the raw body. */
    private verifySignature(rawBody: string, sigHeader: string): boolean {
        if (!sigHeader) return false;
        let timestamp = '';
        const signatures: string[] = [];
        for (const part of sigHeader.split(',')) {
            const [k, v] = part.split('=');
            if (k === 't') timestamp = v;
            else if (k === 'v1' && v) signatures.push(v);
        }
        if (!timestamp || signatures.length === 0) return false;

        // Reject stale timestamps to blunt replay attacks.
        const ts = Number(timestamp);
        const now = Math.floor(Date.now() / 1000);
        if (!Number.isFinite(ts) || Math.abs(now - ts) > WEBHOOK_TOLERANCE_S) return false;

        const expected = crypto
            .createHmac('sha256', this.config.webhookSecret as string)
            .update(`${timestamp}.${rawBody}`)
            .digest('hex');
        return signatures.some((sig) => this.safeEqual(expected, sig));
    }

    /** Constant-time comparison to avoid signature timing leaks. */
    private safeEqual(a: string, b: string): boolean {
        const ab = Buffer.from(a);
        const bb = Buffer.from(b);
        if (ab.length !== bb.length) return false;
        return crypto.timingSafeEqual(ab, bb);
    }
}
