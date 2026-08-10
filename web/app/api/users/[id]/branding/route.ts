import { withAuth, json } from '@/lib/http/handler';
import { ValidationError } from '@/lib/http/errors';
import {
    getResellerBranding,
    setResellerFields,
    setResellerAsset,
    clearResellerBranding,
    type ResellerAsset,
    type ResellerBrandingSettings,
} from '@/lib/shared/services/reseller-branding.service';
import {
    MAX_BRANDING_BYTES,
    isBrandingStorageConfigured,
    storeBrandingAsset,
    deleteBrandingAsset,
} from '@/lib/shared/storage/branding-storage';

// Logo uploads go to object storage via the AWS SDK — Node runtime, not edge.
export const runtime = 'nodejs';

function parseId(raw: string): number {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) throw new ValidationError('Invalid user ID');
    return n;
}

// GET /api/users/[id]/branding - a reseller's logo + primary colour, for the
// admin edit form. Authorization (target is a Reseller the caller manages) is
// enforced in the service, same as every other user mutation.
export const GET = withAuth(null, async (_request, { user, params }) => {
    return json({
        branding: await getResellerBranding(user, parseId(params.id)),
        storageConfigured: isBrandingStorageConfigured(),
        maxBytes: MAX_BRANDING_BYTES,
    });
});

/** Form field carrying each uploadable slot, and the storage kind it becomes. */
const UPLOADS: { field: string; asset: ResellerAsset; slot: 'resellerLogo' | 'resellerFavicon' }[] = [
    // "file" rather than "logo" for the wordmark: the field predates the favicon
    // and renaming it would break a client mid-deploy for no gain.
    { field: 'file', asset: 'logo', slot: 'resellerLogo' },
    { field: 'favicon', asset: 'favicon', slot: 'resellerFavicon' },
];

/**
 * POST /api/users/[id]/branding - set the domain and/or primary colour, and/or
 * replace the logo and favicon (multipart/form-data).
 *
 * Fields, all optional so the form can send only what changed:
 *   siteName      - product name on that domain, or "" to use the platform's
 *   domain        - host the branding applies on, or "" to release it
 *   primaryColor  - hex like "#8B3D88", or "" to fall back to the platform colour
 *   file          - the logo image
 *   favicon       - the browser tab icon
 *
 * Multipart rather than JSON because the artwork has to travel the same way the
 * System Settings branding upload does; the other fields ride along so one save
 * from the form is one request.
 */
export const POST = withAuth(null, async (request, { user, params }) => {
    const targetId = parseId(params.id);
    const form = await request.formData().catch(() => {
        throw new ValidationError('Expected multipart/form-data upload');
    });

    const rawName = form.get('siteName');
    const rawColor = form.get('primaryColor');
    const rawDomain = form.get('domain');
    const files = UPLOADS
        .map((upload) => ({ ...upload, file: form.get(upload.field) }))
        .filter((upload): upload is typeof upload & { file: File } =>
            Boolean(upload.file) && typeof upload.file !== 'string');
    if (rawName === null && rawColor === null && rawDomain === null && files.length === 0) {
        throw new ValidationError('Nothing to update — send siteName, domain, primaryColor, a logo and/or a favicon');
    }

    // Column writes first: if one is rejected nothing has been uploaded yet, so
    // there is no orphaned object to clean up.
    let settings: ResellerBrandingSettings = rawName !== null || rawColor !== null || rawDomain !== null
        ? await setResellerFields(user, targetId, {
            ...(rawName !== null ? { siteName: String(rawName).trim() } : {}),
            ...(rawColor !== null ? { color: String(rawColor).trim() } : {}),
            ...(rawDomain !== null ? { domain: String(rawDomain).trim() } : {}),
        })
        : await getResellerBranding(user, targetId);

    if (files.length > 0 && !isBrandingStorageConfigured()) {
        throw new ValidationError('Object storage is not configured — set the SPACES_* environment variables first');
    }

    for (const { asset, slot, file } of files) {
        if (file.size > MAX_BRANDING_BYTES) {
            throw new ValidationError(`Image is too large (max ${Math.round(MAX_BRANDING_BYTES / 1024 / 1024)}MB)`);
        }

        let stored;
        try {
            stored = await storeBrandingAsset(
                slot,
                file.name || `reseller-${targetId}`,
                file.type || null,
                Buffer.from(await file.arrayBuffer())
            );
        } catch (err) {
            // Unsupported type / size are user errors; surface them as 400.
            throw new ValidationError(err instanceof Error ? err.message : 'Upload failed');
        }

        const result = await setResellerAsset(user, targetId, asset, stored);
        settings = result.settings;
        // Only after the new file is committed — a failed delete must not lose it.
        if (result.previousKey) await deleteBrandingAsset(result.previousKey);
    }

    return json({ branding: settings });
});

// DELETE /api/users/[id]/branding - revert the reseller to platform branding.
export const DELETE = withAuth(null, async (_request, { user, params }) => {
    const { settings, previousKeys } = await clearResellerBranding(user, parseId(params.id));
    for (const key of previousKeys) await deleteBrandingAsset(key);
    return json({ branding: settings });
});
