import { NextRequest, NextResponse } from 'next/server';

/** Escape a string for safe inclusion in HTML text/attribute context. */
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Serialize a value to JSON safe to embed inside a <script> block
 *  (prevents `</script>` breakout and HTML injection). Read back client-side
 *  with JSON.parse on the <script> textContent — no value is interpolated raw. */
function jsonForScript(value: unknown): string {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
}

function errorPage(message: string): NextResponse {
    const html = `<!DOCTYPE html><html><head><title>Payment Error</title></head>` +
        `<body><p>${escapeHtml(message)}</p></body></html>`;
    return new NextResponse(html, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const orderId = params.get('order_id');
    const keyId = params.get('key_id');
    const amountRaw = params.get('amount');
    const currency = params.get('currency') || 'INR';
    const name = params.get('name') || 'License';
    const prefillEmail = params.get('prefill_email') || '';
    const state = params.get('state');
    const callbackUrl = params.get('callback_url');
    const customerId = params.get('customer_id');
    const recurring = params.get('recurring') === '1';

    // Validate required params before building the checkout page.
    if (!orderId || !keyId || !state || !callbackUrl) {
        return errorPage('Invalid or incomplete checkout link.');
    }
    const amount = Number(amountRaw);
    if (!Number.isInteger(amount) || amount <= 0) {
        return errorPage('Invalid payment amount.');
    }
    // Only allow safe callback URLs to avoid open redirects / data exfiltration.
    let callback: URL;
    try {
        callback = new URL(callbackUrl, request.nextUrl.origin);
    } catch {
        return errorPage('Invalid callback URL.');
    }
    
    const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin : null;
    const isAllowed = callback.origin === request.nextUrl.origin || 
                      (allowedOrigin && callback.origin === allowedOrigin) ||
                      callback.hostname === request.nextUrl.hostname;

    if (!isAllowed) {
        return errorPage('Invalid callback URL.');
    }

    // Everything passed to the client is funnelled through a single JSON blob
    // that is JSON-escaped for <script> context — no value is interpolated raw.
    const data = {
        key: keyId,
        amount,
        currency,
        name,
        order_id: orderId,
        prefill_email: prefillEmail,
        state,
        callback_url: callback.toString(),
        customer_id: customerId,
        recurring,
    };

    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Payment Checkout</title>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head>
<body>
    <script id="rzp-data" type="application/json">${jsonForScript(data)}</script>
    <script>
        const d = JSON.parse(document.getElementById('rzp-data').textContent);
        const options = {
            key: d.key,
            amount: d.amount,
            currency: d.currency,
            name: d.name,
            order_id: d.order_id,
            prefill: { email: d.prefill_email },
            ...(d.customer_id ? { customer_id: d.customer_id } : {}),
            ...(d.recurring ? { recurring: 1 } : {}),
            handler: function (response) {
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = d.callback_url;
                const fields = {
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                    state: d.state
                };
                for (const key in fields) {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = key;
                    input.value = fields[key];
                    form.appendChild(input);
                }
                document.body.appendChild(form);
                form.submit();
            },
            modal: {
                ondismiss: function() {
                    const u = new URL(d.callback_url);
                    u.searchParams.set('status', 'cancelled');
                    u.searchParams.set('state', d.state);
                    window.location.href = u.toString();
                }
            }
        };
        const rzp = new Razorpay(options);
        rzp.open();
    </script>
</body>
</html>`;

    return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
}
