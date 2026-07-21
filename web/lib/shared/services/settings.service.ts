import * as repo from '@/lib/shared/repositories/settings.repo';

const GENERAL_KEY = 'general';

export interface GeneralSettings {
    siteName: string;
    supportEmail: string;
    companyName: string;
    companyAddress: string;
    /** Customer account / login portal URL. */
    loginUrl: string;
    /** Public marketing/store site linked from the customer auth pages. */
    websiteUrl: string;
    /** Public base URL encoded into certificate QR codes (no trailing slash). */
    verifyBaseUrl: string;
    /** Main wordmark/logo — public URL, empty means "use the bundled default". */
    logoUrl: string;
    /** Object key behind logoUrl, kept so the old file can be deleted on replace. */
    logoKey: string;
    /** Browser tab icon. */
    faviconUrl: string;
    faviconKey: string;
    /** Illustration shown beside the login/register forms. */
    loginImageUrl: string;
    loginImageKey: string;
}

function defaults(): GeneralSettings {
    const base = process.env.NEXT_PUBLIC_APP_URL || '';
    return {
        siteName: 'Pramaan',
        supportEmail: '',
        companyName: '',
        companyAddress: '',
        loginUrl: base ? `${base}/customer/account` : '',
        websiteUrl: '',
        verifyBaseUrl: '',
        logoUrl: '',
        logoKey: '',
        faviconUrl: '',
        faviconKey: '',
        loginImageUrl: '',
        loginImageKey: '',
    };
}

/** General/branding settings, with defaults filled in for any missing field. */
export async function getGeneralSettings(): Promise<GeneralSettings> {
    const saved = (await repo.getSetting(GENERAL_KEY)) || {};
    return { ...defaults(), ...saved };
}

const STRING_FIELDS: (keyof GeneralSettings)[] = [
    'siteName',
    'supportEmail',
    'companyName',
    'companyAddress',
    'loginUrl',
    'websiteUrl',
    'verifyBaseUrl',
];

/**
 * Persist general settings. Unknown fields are ignored; values are trimmed.
 * Asset URLs/keys are deliberately NOT writable here — they are owned by the
 * branding upload route so a stale form POST can never orphan an uploaded file.
 */
export async function updateGeneralSettings(input: Partial<GeneralSettings>): Promise<GeneralSettings> {
    const current = await getGeneralSettings();
    const next: GeneralSettings = { ...current };
    for (const field of STRING_FIELDS) {
        const v = input[field];
        if (typeof v === 'string') next[field] = field === 'verifyBaseUrl' ? v.trim().replace(/\/+$/, '') : v.trim();
    }
    await repo.setSetting(GENERAL_KEY, next);
    return next;
}

/** Patch the asset fields only. Used by the branding upload/remove route. */
export async function updateBrandingAssets(patch: Partial<GeneralSettings>): Promise<GeneralSettings> {
    const current = await getGeneralSettings();
    const next: GeneralSettings = { ...current, ...patch };
    await repo.setSetting(GENERAL_KEY, next);
    return next;
}
