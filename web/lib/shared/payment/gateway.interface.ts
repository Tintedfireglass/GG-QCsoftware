export interface PaymentGatewayConfig {
    id: number;
    provider: string;
    isActive: boolean;
    config: Record<string, any>;
}

export interface CheckoutSession {
    redirectUrl: string;
    paymentId?: string;
}

export interface PaymentCallbackData {
    status: 'success' | 'failed';
    paymentRef?: string;
    gatewayRef?: string;
    errorMessage?: string;
}

export interface WebhookEvent {
    /** Stable, gateway-assigned event id used for idempotency/dedup. */
    eventId: string | null;
    /** Event type, e.g. 'payment.captured', 'payment.failed', 'refund.processed'. */
    type: string | null;
    /** Opaque checkout state we attached at order creation (from notes), if present. */
    state: string | null;
    status: 'success' | 'failed' | 'ignored';
    paymentRef?: string | null;
    gatewayRef?: string | null;
    errorMessage?: string;
}

export interface RefundResult {
    success: boolean;
    refundRef?: string;
    errorMessage?: string;
}

/** The saved mandate captured from the first (authorization) payment. */
export interface SavedMandate {
    customerRef: string;
    tokenRef: string;
}

export interface RecurringChargeResult {
    success: boolean;
    gatewayRef?: string;
    errorMessage?: string;
}

export interface IPaymentGateway {
    createCheckoutSession(params: {
        orderId: number;
        amountCents: number;
        currency: string;
        customerEmail: string;
        callbackUrl: string;
        state: string;
        /** When true, register a reusable mandate/token for later auto-renewal. */
        recurring?: boolean;
    }): Promise<CheckoutSession>;

    /** After a successful first payment, read the saved mandate (customer + token). */
    fetchSavedMandate(gatewayPaymentRef: string): Promise<SavedMandate | null>;

    /** Charge a previously saved mandate without customer interaction (renewal). */
    chargeRecurring(params: {
        customerRef: string;
        tokenRef: string;
        amountCents: number;
        currency: string;
        customerEmail: string;
        description?: string;
    }): Promise<RecurringChargeResult>;

    verifyCallback(body: any, headers: any): Promise<PaymentCallbackData>;

    /** Verify a server-to-server webhook and extract a normalized event. */
    verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent>;

    /** Issue a refund for a captured payment (gateway payment reference). */
    refund(params: { gatewayPaymentRef: string; amountCents?: number; notes?: Record<string, string> }): Promise<RefundResult>;

    /** Whether the configured keys are 'live' or 'test' (or 'unknown'). */
    keyMode(): 'live' | 'test' | 'unknown';
}
