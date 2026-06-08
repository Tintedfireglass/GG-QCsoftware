import * as repo from '@/lib/shared/repositories/settings.repo';

const GENERAL_KEY = 'general';

export interface GeneralSettings {
    siteName: string;
    supportEmail: string;
    companyName: string;
    companyAddress: string;
    /** Customer account / login portal URL. */
    loginUrl: string;
}

function defaults(): GeneralSettings {
    const base = process.env.NEXT_PUBLIC_APP_URL || '';
    return {
        siteName: 'Pramaan',
        supportEmail: '',
        companyName: '',
        companyAddress: '',
        loginUrl: base ? `${base}/customer/account` : '',
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
];

/** Persist general settings. Unknown fields are ignored; values are trimmed. */
export async function updateGeneralSettings(input: Partial<GeneralSettings>): Promise<GeneralSettings> {
    const current = await getGeneralSettings();
    const next: GeneralSettings = { ...current };
    for (const field of STRING_FIELDS) {
        const v = input[field];
        if (typeof v === 'string') next[field] = v.trim();
    }
    await repo.setSetting(GENERAL_KEY, next);
    return next;
}
