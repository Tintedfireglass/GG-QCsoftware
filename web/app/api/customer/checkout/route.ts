import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { query } from '@/lib/db';
import { extractBearerToken, verifyCustomerToken } from '@/lib/customer-auth';
import { getPlanPriceCents } from '@/lib/license-key';

type Plan = 'monthly' | 'yearly' | 'lifetime';
const CHECKOUT_SECRET = process.env.CUSTOMER_CHECKOUT_SECRET || process.env.CUSTOMER_JWT_SECRET || process.env.JWT_SECRET || 'checkout-secret-change-in-production';

export async function POST(request: NextRequest) {
    try {
        const token = extractBearerToken(request.headers.get('authorization'));
        if (!token) {
            return NextResponse.json({ error: 'Authentication Error', message: 'Missing token' }, { status: 401 });
        }

        const decoded = verifyCustomerToken(token);
        if (!decoded) {
            return NextResponse.json({ error: 'Authentication Error', message: 'Invalid token' }, { status: 401 });
        }

        const body = await request.json();
        const plan = String(body?.plan || '') as Plan;
        const validPlans: Plan[] = ['monthly', 'yearly', 'lifetime'];
        if (!validPlans.includes(plan)) {
            return NextResponse.json({ error: 'Validation Error', message: 'Invalid plan' }, { status: 400 });
        }

        const amountCents = getPlanPriceCents(plan);
        const currency = String(process.env.B2C_CURRENCY || 'INR').toUpperCase();

        const inserted = await query<{ id: number }>(
            `INSERT INTO customer_orders (customer_user_id, plan, amount_cents, currency, status, checkout_state)
             VALUES ($1, $2, $3, $4, 'pending', $5)
             RETURNING id`,
            [decoded.customerId, plan, amountCents, currency, `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`]
        );

        const orderId = inserted[0].id;
        const checkoutState = jwt.sign(
            {
                orderId,
                customerId: decoded.customerId,
                plan,
                scope: 'customer_checkout',
            },
            CHECKOUT_SECRET,
            { expiresIn: '30m' }
        );

        await query(
            'UPDATE customer_orders SET checkout_state = $1, updated_at = NOW() WHERE id = $2',
            [checkoutState, orderId]
        );

        const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
        const callbackUrl = `${appBaseUrl}/api/customer/payment/callback`;
        const gatewayUrl = process.env.PAYMENT_GATEWAY_URL || 'https://payments.example.com/checkout';

        const redirectUrl = new URL(gatewayUrl);
        redirectUrl.searchParams.set('state', checkoutState);
        redirectUrl.searchParams.set('amount_cents', String(amountCents));
        redirectUrl.searchParams.set('currency', currency);
        redirectUrl.searchParams.set('plan', plan);
        redirectUrl.searchParams.set('customer_email', decoded.email);
        redirectUrl.searchParams.set('return_url', callbackUrl);

        return NextResponse.json({
            redirectUrl: redirectUrl.toString(),
            orderId,
        });
    } catch (error) {
        console.error('Customer checkout error:', error);
        return NextResponse.json({ error: 'Server Error', message: 'Failed to create checkout session' }, { status: 500 });
    }
}
