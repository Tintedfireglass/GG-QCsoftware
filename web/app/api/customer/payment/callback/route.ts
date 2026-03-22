import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { transaction } from '@/lib/db';
import { PoolClient } from 'pg';
import { generateRandomLicenseKey, getPlanExpiry } from '@/lib/license-key';

type CheckoutPayload = {
    orderId: number;
    customerId: number;
    plan: 'one_time';
    scope: 'customer_checkout';
};

const CHECKOUT_SECRET = process.env.CUSTOMER_CHECKOUT_SECRET || process.env.CUSTOMER_JWT_SECRET || process.env.JWT_SECRET || 'checkout-secret-change-in-production';

type CallbackInput = {
    state: string | null;
    status: string;
    paymentRef: string | null;
    gatewayRef: string | null;
};

type CallbackResult = {
    success: boolean;
    orderId: number;
    licenseKey: string | null;
    message?: string;
};

async function generateUniqueKey(client: PoolClient): Promise<string> {
    for (let i = 0; i < 10; i++) {
        const key = generateRandomLicenseKey();
        const exists = await client.query('SELECT id FROM license_keys WHERE key = $1', [key]);
        if (exists.rows.length === 0) return key;
    }
    throw new Error('Failed to generate unique license key');
}

async function parseCallbackInput(request: NextRequest): Promise<CallbackInput> {
    let body: Record<string, any> = {};
    if (request.method !== 'GET') {
        try {
            body = await request.json();
        } catch {
            body = {};
        }
    }

    const search = request.nextUrl.searchParams;
    const state = (body.state as string | undefined) ?? search.get('state');
    const status = String(body.status ?? search.get('status') ?? '').toLowerCase();
    const paymentRef =
        (body.payment_ref as string | undefined) ??
        (body.paymentReference as string | undefined) ??
        (body.reference as string | undefined) ??
        search.get('payment_ref') ??
        search.get('paymentReference') ??
        search.get('reference');
    const gatewayRef =
        (body.gateway_ref as string | undefined) ??
        (body.gatewayReference as string | undefined) ??
        (body.razorpay_payment_id as string | undefined) ??
        search.get('gateway_ref') ??
        search.get('gatewayReference') ??
        search.get('razorpay_payment_id');

    return {
        state,
        status,
        paymentRef: paymentRef ?? null,
        gatewayRef: gatewayRef ?? null,
    };
}

async function processCallback(input: CallbackInput): Promise<CallbackResult> {
    if (!input.state) {
        return { success: false, orderId: 0, licenseKey: null, message: 'Missing checkout state' };
    }

    let payload: CheckoutPayload;
    try {
        payload = jwt.verify(input.state, CHECKOUT_SECRET) as CheckoutPayload;
    } catch {
        return { success: false, orderId: 0, licenseKey: null, message: 'Invalid checkout state' };
    }

    if (payload.scope !== 'customer_checkout') {
        return { success: false, orderId: 0, licenseKey: null, message: 'Invalid checkout scope' };
    }

    const success = input.status === 'success' || input.status === 'paid' || input.status === 'completed';

    return await transaction(async (client: PoolClient) => {
        const orderRes = await client.query(
            'SELECT * FROM customer_orders WHERE id = $1 AND customer_user_id = $2',
            [payload.orderId, payload.customerId]
        );

        if (orderRes.rows.length === 0) {
            throw new Error('Order not found');
        }

        const order = orderRes.rows[0];

        if (order.status === 'paid' && order.generated_license_key_id) {
            const keyRes = await client.query(
                'SELECT key FROM license_keys WHERE id = $1',
                [order.generated_license_key_id]
            );
            return {
                success: true,
                orderId: payload.orderId,
                licenseKey: keyRes.rows[0]?.key ?? null,
            };
        }

        if (!success) {
            await client.query(
                `UPDATE customer_orders
                 SET status = 'failed',
                     payment_reference = COALESCE($1, payment_reference),
                     gateway_reference = COALESCE($2, gateway_reference),
                     updated_at = NOW()
                 WHERE id = $3`,
                [input.paymentRef, input.gatewayRef, payload.orderId]
            );
            return {
                success: false,
                orderId: payload.orderId,
                licenseKey: null,
                message: 'Payment failed or cancelled',
            };
        }

        const licenseKey = await generateUniqueKey(client);
        const expiry = getPlanExpiry();

        const keyInsert = await client.query(
            `INSERT INTO license_keys
                (key, type, max_uses, current_uses, customer_user_id, is_active, expires_at, created_by)
             VALUES
                ($1, 'single_use', 1, 0, $2, true, $3, NULL)
             RETURNING id`,
            [licenseKey, payload.customerId, expiry]
        );

        const licenseKeyId = keyInsert.rows[0].id;

        await client.query(
            `UPDATE customer_orders
             SET status = 'paid',
                 payment_reference = COALESCE($1, payment_reference),
                 gateway_reference = COALESCE($2, gateway_reference),
                 generated_license_key_id = $3,
                 updated_at = NOW()
             WHERE id = $4`,
            [input.paymentRef, input.gatewayRef, licenseKeyId, payload.orderId]
        );

        return {
            success: true,
            orderId: payload.orderId,
            licenseKey,
        };
    });
}

export async function GET(request: NextRequest) {
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const accountUrl = new URL('/customer/account', appBaseUrl);

    try {
        const input = await parseCallbackInput(request);
        const result = await processCallback(input);

        accountUrl.searchParams.set('status', result.success ? 'success' : 'failed');
        if (!result.success) {
            accountUrl.searchParams.set('message', result.message || 'Payment failed or cancelled');
        }
        return NextResponse.redirect(accountUrl);
    } catch (error) {
        console.error('Customer payment callback error:', error);
        accountUrl.searchParams.set('status', 'failed');
        accountUrl.searchParams.set('message', 'Unable to complete purchase');
        return NextResponse.redirect(accountUrl);
    }
}

export async function POST(request: NextRequest) {
    try {
        const input = await parseCallbackInput(request);
        const result = await processCallback(input);

        if (!result.success) {
            return NextResponse.json(
                { status: 'failed', message: result.message || 'Payment failed or cancelled' },
                { status: 400 }
            );
        }

        return NextResponse.json({
            status: 'success',
            orderId: result.orderId,
            licenseKey: result.licenseKey,
        });
    } catch (error) {
        console.error('Customer payment callback error:', error);
        return NextResponse.json(
            { status: 'failed', message: 'Unable to complete purchase' },
            { status: 500 }
        );
    }
}
