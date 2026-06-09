import * as repo from '@/lib/shared/repositories/settings.repo';

const LEGAL_KEY = 'legal';

export interface LegalContent {
    termsContent: string;
    privacyContent: string;
    termsUpdatedAt: string | null;
    privacyUpdatedAt: string | null;
}

function defaults(): LegalContent {
    return { termsContent: '', privacyContent: '', termsUpdatedAt: null, privacyUpdatedAt: null };
}

/** Public legal content (Terms & Privacy) served to the mobile app. */
export async function getLegalContent(): Promise<LegalContent> {
    const saved = (await repo.getSetting(LEGAL_KEY)) || {};
    return { ...defaults(), ...saved };
}

/**
 * Persist legal content. Each section's `*UpdatedAt` is stamped when its body
 * changes. `now` is passed in so the caller controls the clock.
 */
export async function updateLegalContent(
    input: Partial<Pick<LegalContent, 'termsContent' | 'privacyContent'>>,
    now: string
): Promise<LegalContent> {
    const current = await getLegalContent();
    const next: LegalContent = { ...current };
    if (typeof input.termsContent === 'string' && input.termsContent !== current.termsContent) {
        next.termsContent = input.termsContent;
        next.termsUpdatedAt = now;
    }
    if (typeof input.privacyContent === 'string' && input.privacyContent !== current.privacyContent) {
        next.privacyContent = input.privacyContent;
        next.privacyUpdatedAt = now;
    }
    await repo.setSetting(LEGAL_KEY, next);
    return next;
}
