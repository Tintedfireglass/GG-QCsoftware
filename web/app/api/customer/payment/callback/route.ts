import { NextRequest, NextResponse } from 'next/server';
import { processPaymentCallback, type CallbackInput } from '@/lib/services/customer.service';

/** Extract callback fields from JSON body and/or query string (gateway-agnostic). */
async function parseCallbackInput(request: NextRequest): Promise<CallbackInput> {
    let body: Record<string, unknown> = {};
    if (request.method !== 'GET') {
        try { body = await request.json(); } catch { body = {}; }
    }
    const search = request.nextUrl.searchParams;
    const pick = (...keys: string[]): string | null => {
        for (const k of keys) {
            const v = body[k];
            if (typeof v === 'string') return v;
        }
        for (const k of keys) {
            const v = search.get(k);
            if (v !== null) return v;
        }
        return null;
    };

    return {
        state: (typeof body.state === 'string' ? body.state : null) ?? search.get('state'),
        status: String((typeof body.status === 'string' ? body.status : null) ?? search.get('status') ?? '').toLowerCase(),
        paymentRef: pick('payment_ref', 'paymentReference', 'reference'),
        gatewayRef: pick('gateway_ref', 'gatewayReference', 'razorpay_payment_id'),
    };
}

// GET — browser redirect from the gateway → bounce to the account page.
export async function GET(request: NextRequest) {
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const accountUrl = new URL('/customer/account', appBaseUrl);
    try {
        const result = await processPaymentCallback(await parseCallbackInput(request));
        accountUrl.searchParams.set('status', result.success ? 'success' : 'failed');
        if (!result.success) accountUrl.searchParams.set('message', result.message || 'Payment failed or cancelled');
        return NextResponse.redirect(accountUrl);
    } catch (error) {
        console.error('Customer payment callback error:', error);
        accountUrl.searchParams.set('status', 'failed');
        accountUrl.searchParams.set('message', 'Unable to complete purchase');
        return NextResponse.redirect(accountUrl);
    }
}

// POST — server-to-server callback → JSON.
export async function POST(request: NextRequest) {
    try {
        const result = await processPaymentCallback(await parseCallbackInput(request));
        if (!result.success) {
            return NextResponse.json({ status: 'failed', message: result.message || 'Payment failed or cancelled' }, { status: 400 });
        }
        return NextResponse.json({ status: 'success', orderId: result.orderId, licenseKey: result.licenseKey });
    } catch (error) {
        console.error('Customer payment callback error:', error);
        return NextResponse.json({ status: 'failed', message: 'Unable to complete purchase' }, { status: 500 });
    }
}
