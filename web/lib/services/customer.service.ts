import { db } from '@/lib/drizzle';
import { verifyPassword, hashPassword } from '@/lib/auth';
import { generateCustomerToken } from '@/lib/customer-auth';
import { signCheckoutState, verifyCheckoutState } from '@/lib/customer-checkout';
import { getPlanPriceCents, getPlanExpiry } from '@/lib/license-key';
import { ValidationError, UnauthorizedError, ConflictError, NotFoundError } from '@/lib/http/errors';
import * as repo from '@/lib/repositories/customer.repo';

function customerResponse(c: { id: number; email: string; full_name: string | null }, token: string) {
    return { token, customer: { id: c.id, email: c.email, fullName: c.full_name } };
}

export async function login(rawEmail: unknown, rawPassword: unknown) {
    const email = String(rawEmail || '').trim().toLowerCase();
    const password = String(rawPassword || '');
    if (!email || !password) throw new ValidationError('Email and password are required');

    const customer = await repo.findActiveCustomerByEmail(email);
    if (!customer || !(await verifyPassword(password, customer.password_hash))) {
        throw new UnauthorizedError('Invalid credentials');
    }
    const token = generateCustomerToken({ customerId: customer.id, email: customer.email });
    return customerResponse({ id: customer.id, email: customer.email, full_name: customer.full_name }, token);
}

export async function register(rawEmail: unknown, rawPassword: unknown, rawFullName: unknown) {
    const email = String(rawEmail || '').trim().toLowerCase();
    const password = String(rawPassword || '');
    const fullName = String(rawFullName || '').trim();
    if (!email || !password) throw new ValidationError('Email and password are required');

    if (await repo.customerEmailExists(email)) {
        throw new ConflictError('Email already registered');
    }
    const passwordHash = await hashPassword(password);
    const customer = await repo.insertCustomer(email, passwordHash, fullName || null);
    const token = generateCustomerToken({ customerId: customer.id, email: customer.email });
    return customerResponse(customer, token);
}

export async function getProfile(customerId: number) {
    const customer = await repo.findCustomerProfile(customerId);
    if (!customer) throw new NotFoundError('Customer not found');
    return { customer: { id: customer.id, email: customer.email, fullName: customer.full_name } };
}

export async function listLicenses(customerId: number) {
    return { licenses: await repo.listCustomerLicenses(customerId) };
}

export async function createCheckout(customerId: number, email: string, appBaseUrl: string) {
    const plan = 'one_time' as const;
    const amountCents = getPlanPriceCents();
    const currency = String(process.env.B2C_CURRENCY || 'INR').toUpperCase();

    const orderId = await repo.createOrder({
        customerId,
        plan,
        amountCents,
        currency,
        checkoutState: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });

    const checkoutState = signCheckoutState({ orderId, customerId, plan });
    await repo.updateOrderCheckoutState(orderId, checkoutState);

    const callbackUrl = `${appBaseUrl}/api/customer/payment/callback`;
    const gatewayUrl = process.env.PAYMENT_GATEWAY_URL || 'https://payments.example.com/checkout';
    const redirectUrl = new URL(gatewayUrl);
    redirectUrl.searchParams.set('state', checkoutState);
    redirectUrl.searchParams.set('amount_cents', String(amountCents));
    redirectUrl.searchParams.set('currency', currency);
    redirectUrl.searchParams.set('plan', plan);
    redirectUrl.searchParams.set('customer_email', email);
    redirectUrl.searchParams.set('return_url', callbackUrl);

    return { redirectUrl: redirectUrl.toString(), orderId };
}

// ── Payment callback ──

export interface CallbackInput {
    state: string | null;
    status: string;
    paymentRef: string | null;
    gatewayRef: string | null;
}

export interface CallbackResult {
    success: boolean;
    orderId: number;
    licenseKey: string | null;
    message?: string;
}

export async function processPaymentCallback(input: CallbackInput): Promise<CallbackResult> {
    if (!input.state) {
        return { success: false, orderId: 0, licenseKey: null, message: 'Missing checkout state' };
    }
    const payload = verifyCheckoutState(input.state);
    if (!payload) {
        return { success: false, orderId: 0, licenseKey: null, message: 'Invalid checkout state' };
    }
    if (payload.scope !== 'customer_checkout') {
        return { success: false, orderId: 0, licenseKey: null, message: 'Invalid checkout scope' };
    }

    const paid = input.status === 'success' || input.status === 'paid' || input.status === 'completed';

    return db.transaction(async (tx) => {
        const order = await repo.findOrder(tx, payload.orderId, payload.customerId);
        if (!order) throw new Error('Order not found');

        if (order.status === 'paid' && order.generated_license_key_id) {
            const key = await repo.findLicenseKeyById(tx, order.generated_license_key_id);
            return { success: true, orderId: payload.orderId, licenseKey: key };
        }

        if (!paid) {
            await repo.markOrderFailed(tx, payload.orderId, input.paymentRef, input.gatewayRef);
            return { success: false, orderId: payload.orderId, licenseKey: null, message: 'Payment failed or cancelled' };
        }

        const licenseKey = await repo.generateUniqueKey(tx);
        const licenseKeyId = await repo.insertCustomerLicenseKey(tx, licenseKey, payload.customerId, getPlanExpiry());
        await repo.markOrderPaid(tx, payload.orderId, input.paymentRef, input.gatewayRef, licenseKeyId);

        return { success: true, orderId: payload.orderId, licenseKey };
    });
}
