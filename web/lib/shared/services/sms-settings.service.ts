import * as providerRepo from '@/lib/shared/repositories/sms-provider.repo';
import { sendOtpSms } from '@/lib/shared/sms/sms-sender';
import { SMS_PROVIDER_IDS, getSmsProviderSpec } from '@/lib/shared/sms/provider-specs';
import { ValidationError, NotFoundError } from '@/lib/http/errors';

/** List providers with non-secret config echoed and secrets reduced to presence flags. */
export async function listProviders() {
    const rows = await providerRepo.getAllProviders();
    return rows.map((r) => {
        const cfg = (r.config as Record<string, unknown>) || {};
        const spec = getSmsProviderSpec(r.provider);
        const config: Record<string, string> = {};
        const secretsPresent: Record<string, boolean> = {};
        for (const f of spec?.fields ?? []) {
            if (f.secret) secretsPresent[f.key] = !!cfg[f.key];
            else config[f.key] = (cfg[f.key] as string) || '';
        }
        return {
            id: r.id,
            provider: r.provider,
            isActive: r.isActive,
            config,
            secretsPresent,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
        };
    });
}

/**
 * Create or update a provider from its spec. Blank secret fields keep the
 * existing saved value so secrets are never wiped by an empty edit.
 */
export async function saveProvider(provider: string, input: Record<string, unknown>, isActive: boolean) {
    const name = provider.toLowerCase();
    const spec = getSmsProviderSpec(name);
    if (!spec) {
        throw new ValidationError(`Unsupported provider. Supported: ${SMS_PROVIDER_IDS.join(', ')}`);
    }

    const existing = (await providerRepo.getAllProviders()).find((p) => p.provider === name);
    const cur = (existing?.config as Record<string, unknown>) || {};

    const next: Record<string, unknown> = { ...cur };
    for (const f of spec.fields) {
        const v = input[f.key];
        if (f.secret) {
            if (typeof v === 'string' && v !== '') next[f.key] = v; // keep existing if blank
        } else if (v !== undefined) {
            next[f.key] = typeof v === 'string' ? v.trim() : v;
        }
    }

    // Required-field validation (secret fields only required on first create).
    for (const f of spec.fields) {
        if (!f.required) continue;
        const missing = f.secret ? !existing && !next[f.key] : !next[f.key];
        if (missing) throw new ValidationError(`${spec.label} ${f.label} is required`);
    }

    return providerRepo.upsertProvider(name, next, isActive);
}

export async function activateProvider(id: number) {
    const row = await providerRepo.getProviderById(id);
    if (!row) throw new NotFoundError('SMS provider not found');
    return providerRepo.setActiveProvider(id);
}

export async function deleteProvider(id: number) {
    const row = await providerRepo.getProviderById(id);
    if (!row) throw new NotFoundError('SMS provider not found');
    return providerRepo.deleteProvider(id);
}

/** Send a test OTP through the active provider to verify configuration. */
export async function sendTestSms(to: string, countryCode?: string): Promise<boolean> {
    const phone = (to || '').trim();
    if (phone.replace(/\D/g, '').length < 6) {
        throw new ValidationError('A valid recipient phone number is required');
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    return sendOtpSms(phone, code, countryCode);
}
