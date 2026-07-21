import { withAuth, json } from '@/lib/http/handler';
import { ValidationError } from '@/lib/http/errors';
import { getGeneralSettings, updateBrandingAssets, type GeneralSettings } from '@/lib/shared/services/settings.service';
import { invalidateBrandingCache } from '@/lib/shared/services/branding.service';
import {
    BRANDING_ASSET_KINDS,
    MAX_BRANDING_BYTES,
    isBrandingStorageConfigured,
    storeBrandingAsset,
    deleteBrandingAsset,
    type BrandingAssetKind,
} from '@/lib/shared/storage/branding-storage';

// Uploads go to object storage via the AWS SDK — Node runtime, not edge.
export const runtime = 'nodejs';

/** settings fields backing each asset slot. */
const FIELDS: Record<BrandingAssetKind, { url: keyof GeneralSettings; key: keyof GeneralSettings }> = {
    logo: { url: 'logoUrl', key: 'logoKey' },
    favicon: { url: 'faviconUrl', key: 'faviconKey' },
    loginImage: { url: 'loginImageUrl', key: 'loginImageKey' },
};

function parseKind(value: unknown): BrandingAssetKind {
    if (typeof value !== 'string' || !BRANDING_ASSET_KINDS.includes(value as BrandingAssetKind)) {
        throw new ValidationError(`kind must be one of: ${BRANDING_ASSET_KINDS.join(', ')}`);
    }
    return value as BrandingAssetKind;
}

// GET /api/admin/branding - current asset slots + whether uploads are possible.
export const GET = withAuth(['SuperAdmin'], async () => {
    const settings = await getGeneralSettings();
    return json({
        storageConfigured: isBrandingStorageConfigured(),
        maxBytes: MAX_BRANDING_BYTES,
        assets: {
            logo: settings.logoUrl,
            favicon: settings.faviconUrl,
            loginImage: settings.loginImageUrl,
        },
    });
});

// POST /api/admin/branding - replace one branding asset (multipart/form-data).
export const POST = withAuth(['SuperAdmin'], async (request) => {
    if (!isBrandingStorageConfigured()) {
        throw new ValidationError('Object storage is not configured — set the SPACES_* environment variables first');
    }

    const form = await request.formData().catch(() => {
        throw new ValidationError('Expected multipart/form-data upload');
    });
    const kind = parseKind(form.get('kind'));
    const file = form.get('file');
    if (!file || typeof file === 'string') throw new ValidationError('No file uploaded');
    if (file.size > MAX_BRANDING_BYTES) {
        throw new ValidationError(`Image is too large (max ${Math.round(MAX_BRANDING_BYTES / 1024 / 1024)}MB)`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let stored;
    try {
        stored = await storeBrandingAsset(kind, file.name || kind, file.type || null, buffer);
    } catch (err) {
        // Unsupported type / size are user errors; surface them as 400.
        throw new ValidationError(err instanceof Error ? err.message : 'Upload failed');
    }

    const fields = FIELDS[kind];
    const previousKey = (await getGeneralSettings())[fields.key];
    const settings = await updateBrandingAssets({ [fields.url]: stored.url, [fields.key]: stored.key });
    invalidateBrandingCache();

    // Only after the new asset is committed — a failed delete must not lose it.
    if (previousKey && previousKey !== stored.key) await deleteBrandingAsset(previousKey);

    return json({ kind, url: stored.url, settings });
});

// DELETE /api/admin/branding?kind=logo - revert a slot to the bundled default.
export const DELETE = withAuth(['SuperAdmin'], async (request) => {
    const kind = parseKind(new URL(request.url).searchParams.get('kind'));
    const fields = FIELDS[kind];
    const previousKey = (await getGeneralSettings())[fields.key];

    const settings = await updateBrandingAssets({ [fields.url]: '', [fields.key]: '' });
    invalidateBrandingCache();
    if (previousKey) await deleteBrandingAsset(previousKey);

    return json({ kind, settings });
});
