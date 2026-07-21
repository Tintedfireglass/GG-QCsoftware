import jwt from 'jsonwebtoken';

const CHECKOUT_SECRET = process.env.CUSTOMER_CHECKOUT_SECRET
    || process.env.CUSTOMER_JWT_SECRET
    || process.env.JWT_SECRET
    || 'checkout-secret-change-in-production';

export interface CheckoutPayload {
    orderId: number;
    customerId: number;
    plan: string;
    /** Buyer-chosen per-platform device caps (store per-platform checkout). When
     *  present, the callback mints the key from these exact caps instead of
     *  scaling the plan's caps by quantity. */
    platformCaps?: Record<string, number>;
    scope: 'customer_checkout';
}

export function signCheckoutState(p: Omit<CheckoutPayload, 'scope'>): string {
    return jwt.sign({ ...p, scope: 'customer_checkout' } satisfies CheckoutPayload, CHECKOUT_SECRET, { expiresIn: '30m' });
}

/** Verify the JWT signature only; scope is checked by the caller so the
 *  'invalid state' vs 'invalid scope' distinction is preserved. */
export function verifyCheckoutState(token: string): CheckoutPayload | null {
    try {
        return jwt.verify(token, CHECKOUT_SECRET) as CheckoutPayload;
    } catch {
        return null;
    }
}
