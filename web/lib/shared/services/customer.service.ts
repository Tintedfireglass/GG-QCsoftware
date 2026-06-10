import { db } from '@/lib/drizzle';
import { verifyPassword, hashPassword } from '@/lib/auth';
import { generateCustomerToken } from '@/lib/customer-auth';
import { signCheckoutState, verifyCheckoutState } from '@/lib/customer-checkout';
import { getPlanPriceCents, getPlanExpiry } from '@/lib/license-key';
import { ValidationError, UnauthorizedError, ConflictError, NotFoundError } from '@/lib/http/errors';
import * as repo from '@/lib/shared/repositories/customer.repo';
import * as plansRepo from '@/lib/shared/repositories/plans.repo';
import * as couponsRepo from '@/lib/shared/repositories/coupons.repo';
import { evaluateCoupon } from '@/lib/shared/services/coupons.service';
import { createPaymentCheckout, fetchSavedMandate } from '@/lib/shared/services/payment.service';
import { sendMail } from '@/lib/shared/email/mailer';
import { renderTemplate } from '@/lib/shared/services/email-settings.service';
import { randomInt } from 'crypto';
import { logger } from '@/lib/logger';

const PW_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
/** Generate a short, human-friendly random password (no ambiguous chars). */
function generatePassword(len = 6): string {
    let out = '';
    for (let i = 0; i < len; i++) out += PW_ALPHABET[randomInt(PW_ALPHABET.length)];
    return out;
}

export interface BuyerInfo {
    pendingPassword?: string | null;
}

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

export async function createCheckout(customerId: number, email: string, appBaseUrl: string, planId?: number | null, autoRenew?: boolean, couponCode?: string | null, quantity = 1, buyer?: BuyerInfo) {
    const qty = Math.max(1, Math.floor(quantity || 1));
    // Plan-driven pricing when a planId is given; otherwise fall back to the legacy env one-time price.
    let planName = 'one_time';
    let amountCents = getPlanPriceCents();
    let currency = String(process.env.B2C_CURRENCY || 'INR').toUpperCase();
    let resolvedPlanId: number | null = null;
    let effectiveAutoRenew = false;

    // Discount audit fields (default: no discount).
    let subtotalCents = amountCents;
    let discountCents = 0;
    let couponId: number | null = null;

    if (planId) {
        const plan = await plansRepo.findPlanById(db, planId);
        if (!plan || !plan.is_active) throw new NotFoundError('Plan not found or inactive');
        // The customer_orders.plan column has a CHECK constraint: one of
        // 'one_time' | 'monthly' | 'yearly' | 'lifetime'. Use billing_type
        // (+ interval for recurring) — NOT the human-readable plan name.
        if (plan.billing_type === 'recurring' && plan.interval) {
            planName = plan.interval; // 'monthly' or 'yearly'
        } else {
            planName = plan.billing_type; // 'one_time'
        }
        amountCents = plan.price_cents * qty;
        currency = (plan.currency || 'INR').toUpperCase();
        resolvedPlanId = plan.id;
        subtotalCents = amountCents;
        // Auto-renew only when the customer opted in, the plan is finite, and it's enabled for the plan.
        effectiveAutoRenew = !!autoRenew && plan.duration_days != null && plan.allow_auto_renew;

        // Apply a coupon if supplied — re-validated server-side against the full
        // (quantity-adjusted) subtotal; the client-sent discount is never trusted.
        // The discount applies to this first purchase only; auto-renewals charge full.
        const code = (couponCode || '').trim();
        if (code) {
            const result = await evaluateCoupon(code, { ...plan, price_cents: amountCents }, customerId);
            discountCents = result.discountCents;
            couponId = result.couponId;
            amountCents = result.totalCents;
        }
    }

    const orderId = await repo.createOrder({
        customerId,
        plan: planName,
        planId: resolvedPlanId,
        amountCents,
        currency,
        checkoutState: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        autoRenew: effectiveAutoRenew,
        subtotalCents,
        discountCents,
        couponId,
        quantity: qty,
        pendingPassword: buyer?.pendingPassword ?? null,
    });

    const checkoutState = signCheckoutState({ orderId, customerId, plan: planName });
    await repo.updateOrderCheckoutState(orderId, checkoutState);

    const callbackUrl = `${appBaseUrl}/api/customer/payment/callback`;
    const session = await createPaymentCheckout({
        orderId,
        amountCents,
        currency,
        customerEmail: email,
        callbackUrl,
        state: checkoutState,
        recurring: effectiveAutoRenew,
    });

    return { redirectUrl: session.redirectUrl, orderId, autoRenew: effectiveAutoRenew, amountCents, discountCents };
}

export interface GuestCheckoutInput {
    planId: number;
    name: string;
    email: string;
    companyName?: string | null;
    phone?: string | null;
    autoRenew?: boolean;
    couponCode?: string | null;
    quantity?: number;
}

/**
 * Store-website checkout without a prior login. Finds or creates the customer by
 * email (new accounts get a generated password, emailed on success), then starts
 * a normal plan checkout. Returns the gateway redirect URL.
 */
export async function guestCheckout(input: GuestCheckoutInput, appBaseUrl: string) {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    if (!email || !name) throw new ValidationError('Name and email are required');

    const company = input.companyName?.trim() || null;
    const phone = input.phone?.trim() || null;

    const existing = await repo.findCustomerByEmailAny(email);

    let customerId: number;
    let pendingPassword: string | null = null;
    if (existing) {
        customerId = existing.id;            // existing account → no new credentials emailed
        await repo.updateCustomerContact(customerId, company, phone);
    } else {
        pendingPassword = generatePassword(6);
        const passwordHash = await hashPassword(pendingPassword);
        const created = await repo.insertCustomer(email, passwordHash, name, company, phone);
        customerId = created.id;
    }

    const result = await createCheckout(customerId, email, appBaseUrl, input.planId, input.autoRenew, input.couponCode, input.quantity ?? 1, {
        pendingPassword,
    });
    return { redirectUrl: result.redirectUrl, orderId: result.orderId };
}

// ── Payment callback ──

export interface CallbackInput {
    state: string | null;
    status: string;
    paymentRef: string | null;
    gatewayRef: string | null;
    appBaseUrl?: string;
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

    let mandateKeyId: number | null = null;       // key needing its saved mandate persisted
    let newlyMintedKey: string | null = null;      // set only when a key is freshly minted (not on replay)
    const result = await db.transaction(async (tx): Promise<CallbackResult> => {
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

        // Build the minted key's entitlement from the order's plan (or legacy defaults).
        let entitlement = {
            type: 'single_use',
            maxUses: 1,
            productScope: ['windows'],
            platformCaps: { windows: 1 } as Record<string, number>,
            expiry: getPlanExpiry(),
            autoRenew: false,
            renewalPlanId: null as number | null,
        };
        if (order.plan_id) {
            const plan = await plansRepo.findPlanById(tx, order.plan_id);
            if (!plan) throw new Error('Plan not found for order');
            // Quantity multiplies the plan's per-platform device caps on this one key.
            const qty = Math.max(1, order.quantity || 1);
            const scaledCaps: Record<string, number> = {};
            for (const [k, v] of Object.entries(plan.platform_caps)) scaledCaps[k] = v * qty;
            const totalDevices = Object.values(scaledCaps).reduce((a, b) => a + b, 0) || 1;
            entitlement = {
                type: totalDevices === 1 ? 'single_use' : 'bulk',
                maxUses: totalDevices,
                productScope: plan.product_scope,
                platformCaps: scaledCaps,
                expiry: plan.duration_days ? new Date(Date.now() + plan.duration_days * 86_400_000) : null,
                autoRenew: order.auto_renew && plan.duration_days != null,
                renewalPlanId: order.auto_renew && plan.duration_days != null ? plan.id : null,
            };
        }

        const licenseKey = await repo.generateUniqueKey(tx);
        const licenseKeyId = await repo.insertCustomerLicenseKey(tx, licenseKey, payload.customerId, entitlement);
        await repo.markOrderPaid(tx, payload.orderId, input.paymentRef, input.gatewayRef, licenseKeyId);

        // Record the coupon redemption (count on paid). Atomic with the payment;
        // the unique constraint on order_id makes retried callbacks safe.
        if (order.coupon_id && order.discount_cents > 0) {
            await couponsRepo.redeemCoupon(tx, order.coupon_id, payload.customerId, payload.orderId, order.discount_cents);
        }

        if (entitlement.autoRenew) mandateKeyId = licenseKeyId;
        newlyMintedKey = licenseKey;
        return { success: true, orderId: payload.orderId, licenseKey };
    });

    // For auto-renew purchases, read the saved mandate from the gateway (network call,
    // done outside the DB transaction) and store it on the key for future renewals.
    if (result.success && mandateKeyId && input.gatewayRef) {
        try {
            const mandate = await fetchSavedMandate(input.gatewayRef);
            if (mandate) {
                await repo.setKeyRenewalToken(mandateKeyId, mandate.customerRef, mandate.tokenRef);
            } else {
                logger.warn('autorenew.mandate.missing', { keyId: mandateKeyId, paymentRef: input.gatewayRef });
            }
        } catch (err) {
            logger.error('autorenew.mandate.capture_failed', { err, keyId: mandateKeyId });
        }
    }

    // Email the license key (and credentials for brand-new accounts) on a fresh
    // purchase. Best-effort and only on the mint path — replayed callbacks skip it.
    if (result.success && newlyMintedKey) {
        try {
            const info = await repo.getOrderEmailInfo(payload.orderId);
            if (info) {
                const base = input.appBaseUrl || process.env.NEXT_PUBLIC_APP_URL || '';
                const message = await renderTemplate('purchase_confirmation', {
                    name: info.full_name,
                    email: info.email,
                    licenseKey: newlyMintedKey,
                    planName: info.plan_name || 'Pramaan License',
                    password: info.pending_password,
                    loginUrl: `${base}/customer/account`,
                });
                if (message) await sendMail(message);
                if (info.pending_password) await repo.clearPendingPassword(payload.orderId);
            }
        } catch (err) {
            logger.error('purchase.email.failed', { err, orderId: payload.orderId });
        }
    }

    return result;
}
