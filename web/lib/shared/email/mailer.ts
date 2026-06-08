import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from '@/lib/logger';
import { getActiveProvider } from '@/lib/shared/repositories/email-provider.repo';

// Email is sent via the active provider configured in the dashboard
// (Email Settings → Providers), falling back to environment variables if none
// is configured in the DB. Two provider kinds are supported today:
//   - brevo : Brevo transactional API   (config: { apiKey, senderEmail, senderName })
//   - smtp  : any SMTP server           (config: { host, port, secure, user, pass, senderEmail, senderName })
// Env fallback: BREVO_API_KEY, or SMTP_HOST/SMTP_PORT/SMTP_SECURE/SMTP_USER/SMTP_PASS,
// with MAIL_FROM as the sender. If nothing is configured, sends are skipped
// (logged) so checkout never fails on email.

export interface MailMessage {
    to: string;
    subject: string;
    html: string;
    text: string;
}

type ResolvedProvider =
    | { kind: 'brevo'; apiKey: string; from: Sender }
    | { kind: 'smtp'; host: string; port: number; secure: boolean; user?: string; pass?: string; from: Sender };

interface Sender {
    email: string;
    name?: string;
}

/** Parse "Name <email@host>" or "email@host" into a sender object. */
function parseSender(raw: string): Sender {
    const match = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
    if (match) return { name: match[1] || undefined, email: match[2] };
    return { email: raw.trim() };
}

function senderFromConfig(config: Record<string, any>): Sender {
    const email = config.senderEmail || process.env.MAIL_FROM || process.env.SMTP_USER || '';
    return { email: parseSender(String(email)).email, name: config.senderName || undefined };
}

function formatFrom(s: Sender): string {
    return s.name ? `${s.name} <${s.email}>` : s.email;
}

/** Resolve the active provider: DB first, then environment variables. */
async function resolveProvider(): Promise<ResolvedProvider | null> {
    try {
        const row = await getActiveProvider();
        const cfg = (row?.config as Record<string, any>) || {};
        if (row?.provider === 'brevo' && cfg.apiKey) {
            return { kind: 'brevo', apiKey: cfg.apiKey, from: senderFromConfig(cfg) };
        }
        if (row?.provider === 'smtp' && cfg.host) {
            return {
                kind: 'smtp',
                host: cfg.host,
                port: Number(cfg.port || 587),
                secure: cfg.secure === true || String(cfg.secure).toLowerCase() === 'true',
                user: cfg.user,
                pass: cfg.pass,
                from: senderFromConfig(cfg),
            };
        }
    } catch (err) {
        logger.error('email.provider.db_lookup_failed', { err });
    }

    // Environment fallback.
    const from = parseSender(process.env.MAIL_FROM || process.env.SMTP_USER || '');
    if (process.env.BREVO_API_KEY) {
        return { kind: 'brevo', apiKey: process.env.BREVO_API_KEY, from };
    }
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (host && user && pass) {
        return {
            kind: 'smtp',
            host,
            port: Number(process.env.SMTP_PORT || 587),
            secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
            user,
            pass,
            from,
        };
    }
    return null;
}

async function sendViaBrevo(apiKey: string, from: Sender, msg: MailMessage): Promise<void> {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'api-key': apiKey,
            'content-type': 'application/json',
            accept: 'application/json',
        },
        body: JSON.stringify({
            sender: from,
            to: [{ email: msg.to }],
            subject: msg.subject,
            htmlContent: msg.html,
            textContent: msg.text,
        }),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`brevo ${res.status}: ${detail}`);
    }
}

let smtpCache: { key: string; transport: Transporter } | null = null;

function getSmtpTransport(p: Extract<ResolvedProvider, { kind: 'smtp' }>): Transporter {
    const key = `${p.host}:${p.port}:${p.secure}:${p.user || ''}`;
    if (smtpCache && smtpCache.key === key) return smtpCache.transport;
    const transport = nodemailer.createTransport({
        host: p.host,
        port: p.port,
        secure: p.secure,
        auth: p.user && p.pass ? { user: p.user, pass: p.pass } : undefined,
    });
    smtpCache = { key, transport };
    return transport;
}

/** Best-effort send. Returns true if dispatched, false if skipped/failed. */
export async function sendMail(msg: MailMessage): Promise<boolean> {
    const provider = await resolveProvider();
    if (!provider) {
        logger.warn('email.skipped.not_configured', { to: msg.to, subject: msg.subject });
        return false;
    }
    try {
        if (provider.kind === 'brevo') {
            await sendViaBrevo(provider.apiKey, provider.from, msg);
        } else {
            await getSmtpTransport(provider).sendMail({
                from: formatFrom(provider.from),
                to: msg.to,
                subject: msg.subject,
                html: msg.html,
                text: msg.text,
            });
        }
        logger.info('email.sent', { provider: provider.kind, to: msg.to, subject: msg.subject });
        return true;
    } catch (err) {
        logger.error('email.failed', { provider: provider.kind, err, to: msg.to, subject: msg.subject });
        return false;
    }
}
