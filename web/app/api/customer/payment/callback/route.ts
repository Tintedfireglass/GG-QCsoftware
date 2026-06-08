import { NextRequest, NextResponse } from 'next/server';
import { processPaymentCallback, type CallbackInput } from '@/lib/shared/services/customer.service';
import { verifyPaymentCallback } from '@/lib/shared/services/payment.service';
import { logger } from '@/lib/logger';

/** Read the request body as an object, supporting JSON and form-encoded posts.
 *  The gateway return is an HTML form POST (url-encoded); server-to-server is JSON. */
async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
    if (request.method === 'GET') return {};
    const ct = (request.headers.get('content-type') || '').toLowerCase();
    try {
        if (ct.includes('application/json')) return await request.json();
        if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
            const fd = await request.formData();
            const obj: Record<string, unknown> = {};
            fd.forEach((v, k) => { obj[k] = typeof v === 'string' ? v : ''; });
            return obj;
        }
        return await request.json();
    } catch {
        return {};
    }
}

/** A browser navigation (gateway redirect / form POST) wants an HTML redirect;
 *  a JSON/API caller wants JSON. */
function wantsHtml(request: NextRequest): boolean {
    if (request.method === 'GET') return true;
    const ct = (request.headers.get('content-type') || '').toLowerCase();
    return ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data');
}

/** Build the normalized callback input from query + parsed body (gateway-agnostic). */
async function parseCallbackInput(request: NextRequest, body: Record<string, unknown>): Promise<CallbackInput> {
    const search = request.nextUrl.searchParams;
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    // Razorpay signed return → verify the signature.
    if (body.razorpay_signature) {
        const headers = Object.fromEntries(request.headers.entries());
        const verification = await verifyPaymentCallback(body, headers);
        return {
            state: (typeof body.state === 'string' ? body.state : null) ?? search.get('state'),
            status: verification.status,
            paymentRef: verification.paymentRef || null,
            gatewayRef: verification.gatewayRef || null,
            appBaseUrl,
        };
    }

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
        appBaseUrl,
    };
}

async function handle(request: NextRequest): Promise<NextResponse> {
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const html = wantsHtml(request);
    const body = await readBody(request);

    if (html) {
        // Browser flow → redirect to a public completion page (guests aren't logged in).
        const url = new URL('/customer/checkout-complete', appBaseUrl);
        try {
            const result = await processPaymentCallback(await parseCallbackInput(request, body));
            url.searchParams.set('status', result.success ? 'success' : 'failed');
            if (!result.success) url.searchParams.set('message', result.message || 'Payment failed or cancelled');
        } catch (error) {
            logger.error('payment.callback.error', { err: error });
            url.searchParams.set('status', 'failed');
            url.searchParams.set('message', 'Unable to complete purchase');
        }
        // 303 so the browser issues a GET to the completion page after a POST.
        return NextResponse.redirect(url, 303);
    }

    // API / server-to-server flow → JSON.
    try {
        const result = await processPaymentCallback(await parseCallbackInput(request, body));
        if (!result.success) {
            return NextResponse.json({ status: 'failed', message: result.message || 'Payment failed or cancelled' }, { status: 400 });
        }
        return NextResponse.json({ status: 'success', orderId: result.orderId, licenseKey: result.licenseKey });
    } catch (error) {
        logger.error('payment.callback.error', { err: error });
        return NextResponse.json({ status: 'failed', message: 'Unable to complete purchase' }, { status: 500 });
    }
}

// GET — browser redirect from the gateway (e.g. cancel/dismiss).
export async function GET(request: NextRequest) {
    return handle(request);
}

// POST — gateway form return (browser) or server-to-server callback.
export async function POST(request: NextRequest) {
    return handle(request);
}
