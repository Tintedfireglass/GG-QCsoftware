import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhook } from '@/lib/shared/services/payment.service';
import { processPaymentCallback } from '@/lib/shared/services/customer.service';
import { logger } from '@/lib/logger';

/**
 * Server-to-server payment webhook (e.g. Razorpay payment.captured / payment.failed).
 * This is the reliable path: it fires even if the customer closes the browser
 * before the redirect, so the license key is still issued. Signature is verified
 * against the gateway's webhook secret and events are deduped for idempotency.
 */
export async function POST(request: NextRequest) {
    // Raw body is required for HMAC signature verification — do not parse first.
    const rawBody = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

    let verified;
    try {
        verified = await verifyWebhook(rawBody, headers);
    } catch (err) {
        logger.error('payment.webhook.error', { err });
        // 500 → gateway will retry.
        return NextResponse.json({ status: 'error' }, { status: 500 });
    }

    const { event, duplicate } = verified;

    if (event.status === 'failed' && !event.state) {
        // Bad signature or unverifiable payload → reject so it isn't silently trusted.
        logger.warn('payment.webhook.rejected', { reason: event.errorMessage, type: event.type });
        return NextResponse.json({ status: 'rejected', message: event.errorMessage }, { status: 400 });
    }

    if (duplicate) {
        logger.info('payment.webhook.duplicate', { eventId: event.eventId, type: event.type });
        return NextResponse.json({ status: 'duplicate' });
    }

    if (event.status === 'ignored' || !event.state) {
        logger.info('payment.webhook.ignored', { type: event.type, hasState: !!event.state });
        return NextResponse.json({ status: 'ignored' });
    }

    try {
        const result = await processPaymentCallback({
            state: event.state,
            status: event.status === 'success' ? 'success' : 'failed',
            paymentRef: event.paymentRef ?? null,
            gatewayRef: event.gatewayRef ?? null,
        });
        logger.info('payment.webhook.processed', { type: event.type, orderId: result.orderId, success: result.success });
        return NextResponse.json({ status: 'ok', orderId: result.orderId });
    } catch (err) {
        logger.error('payment.webhook.process_error', { err, type: event.type });
        return NextResponse.json({ status: 'error' }, { status: 500 });
    }
}
