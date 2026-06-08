import * as providerRepo from '@/lib/shared/repositories/email-provider.repo';
import * as templateRepo from '@/lib/shared/repositories/email-template.repo';
import { getGeneralSettings } from '@/lib/shared/services/settings.service';
import {
    getTemplateDef,
    listTemplateDefs,
    renderString,
    BRANDING_VARS,
    type TemplateVar,
} from '@/lib/shared/email/template-registry';
import { sendMail, type MailMessage } from '@/lib/shared/email/mailer';
import { ValidationError, NotFoundError } from '@/lib/http/errors';

export const SUPPORTED_PROVIDERS = ['smtp', 'brevo'] as const;
export type EmailProviderName = (typeof SUPPORTED_PROVIDERS)[number];

/** Secret config fields, blanked on read and preserved on edit when left empty. */
const SECRET_FIELDS = ['apiKey', 'pass'];

// ── Providers ────────────────────────────────────────────────────────────────

/** List providers with secrets redacted (never leave the server). */
export async function listProviders() {
    const rows = await providerRepo.getAllProviders();
    return rows.map((r) => {
        const cfg = (r.config as Record<string, any>) || {};
        return {
            id: r.id,
            provider: r.provider,
            isActive: r.isActive,
            senderEmail: cfg.senderEmail || '',
            senderName: cfg.senderName || '',
            // Non-secret SMTP fields are safe to echo back for editing.
            host: cfg.host || '',
            port: cfg.port || '',
            secure: cfg.secure ?? false,
            user: cfg.user || '',
            hasApiKey: !!cfg.apiKey,
            hasPass: !!cfg.pass,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
        };
    });
}

function validateProviderConfig(provider: EmailProviderName, cfg: Record<string, any>, isCreate: boolean) {
    if (!cfg.senderEmail || typeof cfg.senderEmail !== 'string') {
        throw new ValidationError('Sender email is required');
    }
    if (provider === 'brevo') {
        if (isCreate && !cfg.apiKey) throw new ValidationError('Brevo API key is required');
    } else if (provider === 'smtp') {
        if (!cfg.host) throw new ValidationError('SMTP host is required');
        if (isCreate && !cfg.pass) throw new ValidationError('SMTP password is required');
    }
}

/**
 * Create or update a provider. On update, blank secret fields keep the existing
 * saved value so secrets are never wiped by an empty edit.
 */
export async function saveProvider(provider: string, input: Record<string, any>, isActive: boolean) {
    const name = provider.toLowerCase();
    if (!SUPPORTED_PROVIDERS.includes(name as EmailProviderName)) {
        throw new ValidationError(`Unsupported provider. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
    }

    const existing = (await providerRepo.getAllProviders()).find((p) => p.provider === name);
    const cur = (existing?.config as Record<string, any>) || {};

    // Whitelist & merge config fields per provider.
    const allowed =
        name === 'brevo'
            ? ['apiKey', 'senderEmail', 'senderName']
            : ['host', 'port', 'secure', 'user', 'pass', 'senderEmail', 'senderName'];

    const next: Record<string, any> = { ...cur };
    for (const f of allowed) {
        const v = input[f];
        if (SECRET_FIELDS.includes(f)) {
            if (typeof v === 'string' && v !== '') next[f] = v; // keep existing if blank
        } else if (v !== undefined) {
            next[f] = f === 'port' ? Number(v) || 587 : f === 'secure' ? v === true || v === 'true' : v;
        }
    }

    validateProviderConfig(name as EmailProviderName, next, !existing);
    return providerRepo.upsertProvider(name, next, isActive);
}

export async function activateProvider(id: number) {
    const row = await providerRepo.getProviderById(id);
    if (!row) throw new NotFoundError('Email provider not found');
    return providerRepo.setActiveProvider(id);
}

export async function deleteProvider(id: number) {
    const row = await providerRepo.getProviderById(id);
    if (!row) throw new NotFoundError('Email provider not found');
    return providerRepo.deleteProvider(id);
}

// ── Templates ────────────────────────────────────────────────────────────────

function varsFor(key: string): TemplateVar[] {
    const def = getTemplateDef(key);
    return [...(def?.variables || []), ...BRANDING_VARS];
}

/** List all known templates, merging code defaults with saved overrides. */
export async function listTemplates() {
    const overrides = new Map((await templateRepo.getAllTemplates()).map((t) => [t.key, t]));
    return listTemplateDefs().map((def) => {
        const o = overrides.get(def.key);
        return {
            key: def.key,
            name: def.name,
            description: def.description,
            customized: !!o,
            updatedAt: o?.updatedAt || null,
        };
    });
}

/** Get one template's effective content (override if present, else default) + metadata. */
export async function getTemplate(key: string) {
    const def = getTemplateDef(key);
    if (!def) throw new NotFoundError('Unknown template');
    const o = await templateRepo.getTemplate(key);
    return {
        key: def.key,
        name: def.name,
        description: def.description,
        variables: varsFor(key),
        customized: !!o,
        subject: o?.subject ?? def.subject,
        html: o?.html ?? def.html,
        text: o?.text ?? def.text,
        default: { subject: def.subject, html: def.html, text: def.text },
    };
}

export async function updateTemplate(
    key: string,
    input: { subject?: string; html?: string; text?: string }
) {
    const def = getTemplateDef(key);
    if (!def) throw new NotFoundError('Unknown template');
    const cur = await getTemplate(key);
    const subject = (input.subject ?? cur.subject).trim();
    const html = input.html ?? cur.html;
    const text = input.text ?? cur.text;
    if (!subject) throw new ValidationError('Subject is required');
    if (!html.trim()) throw new ValidationError('HTML body is required');
    await templateRepo.upsertTemplate({ key, name: def.name, subject, html, text });
    return getTemplate(key);
}

/** Revert a template to its code default by removing the override row. */
export async function resetTemplate(key: string) {
    if (!getTemplateDef(key)) throw new NotFoundError('Unknown template');
    await templateRepo.deleteTemplate(key);
    return getTemplate(key);
}

/** Sample data for previewing a template (branding + per-variable samples). */
async function sampleData(key: string): Promise<Record<string, unknown>> {
    const general = await getGeneralSettings();
    const data: Record<string, unknown> = { ...general };
    for (const v of getTemplateDef(key)?.variables || []) data[v.name] = v.sample;
    return data;
}

/** Render an (optionally unsaved) draft against sample data, for live preview. */
export async function previewTemplate(
    key: string,
    draft?: { subject?: string; html?: string; text?: string }
) {
    const def = getTemplateDef(key);
    if (!def) throw new NotFoundError('Unknown template');
    const o = await templateRepo.getTemplate(key);
    const subject = draft?.subject ?? o?.subject ?? def.subject;
    const html = draft?.html ?? o?.html ?? def.html;
    const text = draft?.text ?? o?.text ?? def.text;
    const data = await sampleData(key);
    return {
        subject: renderString(subject, data),
        html: renderString(html, data),
        text: renderString(text, data),
    };
}

// ── Rendering for real sends ──────────────────────────────────────────────────

/**
 * Render a template to a ready-to-send message. Uses the saved override if any,
 * else the code default, and injects branding (siteName/supportEmail/…) on top
 * of the caller-supplied data. Returns null if the template key is unknown.
 */
export async function renderTemplate(
    key: string,
    data: Record<string, unknown> & { email: string }
): Promise<MailMessage | null> {
    const def = getTemplateDef(key);
    if (!def) return null;
    const o = await templateRepo.getTemplate(key);
    const general = await getGeneralSettings();
    const merged = { ...general, ...data };
    return {
        to: data.email,
        subject: renderString(o?.subject ?? def.subject, merged),
        html: renderString(o?.html ?? def.html, merged),
        text: renderString(o?.text ?? def.text, merged),
    };
}

// ── Test send ────────────────────────────────────────────────────────────────

/** Send a test email through the active provider to verify configuration. */
export async function sendTestEmail(to: string): Promise<boolean> {
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
        throw new ValidationError('A valid recipient email is required');
    }
    const general = await getGeneralSettings();
    const brand = general.siteName || 'Pramaan';
    return sendMail({
        to,
        subject: `${brand} — test email`,
        html: `<div style="font-family:Arial,sans-serif;color:#0f172a">
          <h2 style="color:#7c3aed">${brand} email is working ✅</h2>
          <p>This is a test message sent from your dashboard's Email Settings.</p>
          <p style="color:#94a3b8;font-size:12px">If you received this, your active email provider is configured correctly.</p>
        </div>`,
        text: `${brand} test email\n\nThis is a test message sent from your dashboard's Email Settings. If you received this, your active email provider is configured correctly.`,
    });
}
