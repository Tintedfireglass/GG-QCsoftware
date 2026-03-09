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

async function generateUniqueKey(client: PoolClient): Promise<string> {
    for (let i = 0; i < 10; i++) {
        const key = generateRandomLicenseKey();
        const exists = await client.query('SELECT id FROM license_keys WHERE key = $1', [key]);
        if (exists.rows.length === 0) return key;
    }
    throw new Error('Failed to generate unique license key');
}

export async function GET(request: NextRequest) {
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const accountUrl = new URL('/customer/account', appBaseUrl);

    try {
        const search = request.nextUrl.searchParams;
        const state = search.get('state');
        const status = (search.get('status') || '').toLowerCase();
        const paymentRef = search.get('payment_ref') || search.get('paymentReference');
        const gatewayRef = search.get('gateway_ref') || search.get('gatewayReference');

        if (!state) {
            accountUrl.searchParams.set('status', 'failed');
            accountUrl.searchParams.set('message', 'Missing checkout state');
            return NextResponse.redirect(accountUrl);
        }

        let payload: CheckoutPayload;
        try {
            payload = jwt.verify(state, CHECKOUT_SECRET) as CheckoutPayload;
        } catch {
            accountUrl.searchParams.set('status', 'failed');
            accountUrl.searchParams.set('message', 'Invalid checkout state');
            return NextResponse.redirect(accountUrl);
        }

        if (payload.scope !== 'customer_checkout') {
            accountUrl.searchParams.set('status', 'failed');
            accountUrl.searchParams.set('message', 'Invalid checkout scope');
            return NextResponse.redirect(accountUrl);
        }

        const success = status === 'success' || status === 'paid' || status === 'completed';

        await transaction(async (client: PoolClient) => {
            const orderRes = await client.query(
                'SELECT * FROM customer_orders WHERE id = $1 AND customer_user_id = $2',
                [payload.orderId, payload.customerId]
            );

            if (orderRes.rows.length === 0) {
                throw new Error('Order not found');
            }

            const order = orderRes.rows[0];

            if (order.status === 'paid' && order.generated_license_key_id) {
                return;
            }

            if (!success) {
                await client.query(
                    `UPDATE customer_orders
                     SET status = 'failed',
                         payment_reference = COALESCE($1, payment_reference),
                         gateway_reference = COALESCE($2, gateway_reference),
                         updated_at = NOW()
                     WHERE id = $3`,
                    [paymentRef, gatewayRef, payload.orderId]
                );
                return;
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
                [paymentRef, gatewayRef, licenseKeyId, payload.orderId]
            );
        });

        accountUrl.searchParams.set('status', success ? 'success' : 'failed');
        if (!success) {
            accountUrl.searchParams.set('message', 'Payment failed or cancelled');
        }
        return NextResponse.redirect(accountUrl);
    } catch (error) {
        console.error('Customer payment callback error:', error);
        accountUrl.searchParams.set('status', 'failed');
        accountUrl.searchParams.set('message', 'Unable to complete purchase');
        return NextResponse.redirect(accountUrl);
    }
}
