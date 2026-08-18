import { logger } from '@/lib/logger';
import { getActiveSmsProvider } from '@/lib/shared/repositories/sms-provider.repo';

// SMS is sent via the active provider configured in the dashboard
// (SMS Settings), falling back to environment variables if none is in the DB.
// Provider kinds (add one via resolveProvider + a send* function + provider-specs):
//   - msg91         : MSG91 OTP API   (config: { authKey, templateId, senderId? })
//   - grow_infinity : Grow Infinity   (config: { key, from, entityid, templateid })
// Env fallback: MSG91_AUTH_KEY/MSG91_OTP_TEMPLATE_ID/MSG91_SENDER_ID, or
// SMS_API_KEY/GROW_INFINITY_FROM/GROW_INFINITY_ENTITY_ID/GROW_INFINITY_TEMPLATE_ID.
// If nothing is configured, OTP sends are skipped (logged) — callers decide
// whether that's fatal (it is in production; see mobile-auth.service).

type ResolvedProvider =
    | { kind: 'msg91'; authKey: string; templateId?: string; senderId?: string }
    | { kind: 'grow_infinity'; apiKey: string; from: string; entityid: string; templateid: string };

/** Resolve the active SMS provider: DB first, then environment variables. */
async function resolveProvider(): Promise<ResolvedProvider | null> {
    try {
        const row = await getActiveSmsProvider();
        const cfg = (row?.config as Record<string, unknown>) || {};
        const str = (k: string) => (typeof cfg[k] === 'string' ? (cfg[k] as string) : undefined);
        if (row?.provider === 'msg91' && str('authKey')) {
            return { kind: 'msg91', authKey: str('authKey')!, templateId: str('templateId'), senderId: str('senderId') };
        }
        if (row?.provider === 'grow_infinity' && str('key') && str('from') && str('entityid') && str('templateid')) {
            return { kind: 'grow_infinity', apiKey: str('key')!, from: str('from')!, entityid: str('entityid')!, templateid: str('templateid')! };
        }
    } catch (err) {
        logger.error('sms.provider.db_lookup_failed', { err });
    }

    if (process.env.MSG91_AUTH_KEY) {
        return {
            kind: 'msg91',
            authKey: process.env.MSG91_AUTH_KEY,
            templateId: process.env.MSG91_OTP_TEMPLATE_ID,
            senderId: process.env.MSG91_SENDER_ID,
        };
    }
    if (process.env.SMS_API_KEY && process.env.GROW_INFINITY_ENTITY_ID && process.env.GROW_INFINITY_TEMPLATE_ID) {
        return {
            kind: 'grow_infinity',
            apiKey: process.env.SMS_API_KEY,
            from: process.env.GROW_INFINITY_FROM || 'GGURUZ',
            entityid: process.env.GROW_INFINITY_ENTITY_ID,
            templateid: process.env.GROW_INFINITY_TEMPLATE_ID,
        };
    }
    return null;
}

/** Digits-only mobile with country code (MSG91 wants e.g. 919876543210). */
function normalizeMobile(phone: string, countryCode?: string): string {
    let digits = phone.replace(/\D/g, '');
    const cc = (countryCode || '').replace(/\D/g, '');
    if (cc && digits.length <= 10 && !digits.startsWith(cc)) digits = cc + digits;
    return digits;
}

/**
 * Send a caller-generated OTP via MSG91's OTP endpoint. We pass our own `otp`
 * so generation + verification stay on our side; MSG91 only delivers it through
 * the registered (DLT) template.
 */
async function sendViaMsg91Otp(p: Extract<ResolvedProvider, { kind: 'msg91' }>, mobile: string, otp: string): Promise<void> {
    const url = new URL('https://control.msg91.com/api/v5/otp');
    url.searchParams.set('mobile', mobile);
    url.searchParams.set('otp', otp);
    if (p.templateId) url.searchParams.set('template_id', p.templateId);
    if (p.senderId) url.searchParams.set('sender', p.senderId);

    const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { authkey: p.authKey, 'content-type': 'application/json' },
        body: JSON.stringify({}),
    });
    const data = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || data?.type === 'error') {
        throw new Error(`msg91 ${res.status}: ${data?.message || JSON.stringify(data)}`);
    }
}

// The OTP message body must match the DLT-approved template for the configured
// Entity/Template ID. Keep this text in sync with that approved template.
function growInfinityOtpBody(otp: string): string {
    return `Your OTP from Gadget Guruz is ${otp} and is valid for the next 10 minutes. Kindly do not share OTP with anyone.`;
}

// Grow Infinity always answers HTTP 200 and reports the real outcome in the JSON
// `status` code: 100 = accepted for delivery (a `messageid` is returned), anything
// else is a rejection (700 = no valid recipient, 900103 = blacklisted number, ...).
// Never infer success from the HTTP status alone.
const GROW_INFINITY_ACCEPTED = 100;

async function sendViaGrowInfinity(p: Extract<ResolvedProvider, { kind: 'grow_infinity' }>, mobile: string, otp: string): Promise<string | undefined> {
    const res = await fetch('https://api.grow-infinity.io/api/jsms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            key: p.apiKey,
            to: mobile,
            from: p.from,
            body: growInfinityOtpBody(otp),
            entityid: p.entityid,
            templateid: p.templateid,
        }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`grow_infinity http ${res.status}: ${text.slice(0, 300)}`);

    let data: { status?: number | string; description?: string; messageid?: string };
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`grow_infinity: unparseable response: ${text.slice(0, 300)}`);
    }
    if (Number(data.status) !== GROW_INFINITY_ACCEPTED) {
        throw new Error(`grow_infinity status ${data.status}: ${data.description || text.slice(0, 300)}`);
    }
    return data.messageid;
}

/** Best-effort OTP delivery. Returns true if dispatched, false if skipped/failed. */
export async function sendOtpSms(phone: string, otp: string, countryCode?: string): Promise<boolean> {
    const provider = await resolveProvider();
    if (!provider) {
        logger.warn('sms.skipped.not_configured', { phone });
        return false;
    }
    const mobile = normalizeMobile(phone, countryCode);
    try {
        let messageId: string | undefined;
        if (provider.kind === 'msg91') {
            await sendViaMsg91Otp(provider, mobile, otp);
        } else {
            messageId = await sendViaGrowInfinity(provider, mobile, otp);
        }
        logger.info('sms.otp.sent', { provider: provider.kind, phone, messageId });
        return true;
    } catch (err) {
        logger.error('sms.otp.failed', {
            provider: provider.kind,
            phone,
            error: err instanceof Error ? err.message : String(err),
        });
        return false;
    }
}

/** True when an SMS provider is configured (DB or env). */
export async function isSmsConfigured(): Promise<boolean> {
    return (await resolveProvider()) !== null;
}
