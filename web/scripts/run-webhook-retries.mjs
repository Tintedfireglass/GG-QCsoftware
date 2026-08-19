// Re-attempt partner webhook deliveries whose backoff has elapsed.
//
// Entry point for the scheduled Job component on DigitalOcean App Platform.
// Deliberately plain Node with global fetch — no curl, no tsx, nothing from
// devDependencies — so it runs in the same image the app is built into.
//
//   Run command : node scripts/run-webhook-retries.mjs
//   Env         : APP_URL, CRON_SECRET
//
// Exits non-zero on failure so a failed run is visible in the Job's history
// rather than silently "succeeding".

const appUrl = process.env.APP_URL;
const secret = process.env.CRON_SECRET;

if (!appUrl || !secret) {
    console.error('APP_URL and CRON_SECRET must both be set');
    process.exit(1);
}

const endpoint = `${appUrl.replace(/\/+$/, '')}/api/admin/partner-webhooks/retry`;

try {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'X-Cron-Secret': secret },
        // Generous: the sweep POSTs to partner endpoints, each with its own timeout.
        signal: AbortSignal.timeout(120_000),
    });

    const body = await response.text();
    if (!response.ok) {
        console.error(`Retry sweep failed: HTTP ${response.status} ${body}`);
        process.exit(1);
    }
    console.log(`Retry sweep ok: ${body}`);
} catch (err) {
    console.error(`Retry sweep errored: ${err.message}`);
    process.exit(1);
}
