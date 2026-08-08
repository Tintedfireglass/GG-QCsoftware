import { randomBytes } from 'crypto';
import path from 'path';
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
} from '@aws-sdk/client-s3';

/**
 * Object-storage backend for white-label branding assets (logo, favicon, login
 * illustration). Same DigitalOcean Spaces / S3-compatible bucket the release
 * installers use — the container filesystem is ephemeral, so uploaded artwork
 * cannot live on local disk.
 *
 * Unlike installers, branding assets are served straight to browsers (and to
 * the PDF exporter), so they are uploaded `public-read` and referenced by their
 * public URL. Nothing here is secret.
 *
 * Object key layout: <SPACES_BRANDING_PREFIX>/<kind>-<random>.<ext>
 *
 * Required env: SPACES_REGION, SPACES_ENDPOINT, SPACES_BUCKET, SPACES_KEY,
 * SPACES_SECRET. Optional: SPACES_BRANDING_PREFIX (default "branding"),
 * SPACES_PUBLIC_BASE (CDN origin; defaults to the virtual-hosted bucket URL).
 */

const KEY_PREFIX = (process.env.SPACES_BRANDING_PREFIX ?? 'branding').replace(/^\/+|\/+$/g, '');

/** Platform-wide branding slots an admin can replace via System Settings. */
export const BRANDING_ASSET_KINDS = ['logo', 'favicon', 'loginImage'] as const;
export type BrandingAssetKind = (typeof BRANDING_ASSET_KINDS)[number];

/**
 * Slots stored in the same bucket but owned by a row rather than by settings.
 * Only the key prefix differs, so reseller logos are still recognisable in the
 * bucket without a second storage module.
 */
export type BrandingAssetSlot = BrandingAssetKind | 'resellerLogo';

/** Image types we accept, mapped to the extension we store them under. */
const ALLOWED_TYPES: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico',
};

/** Logos are artwork, not installers — keep them small enough to inline anywhere. */
export const MAX_BRANDING_BYTES = 2 * 1024 * 1024;

let _client: S3Client | null = null;
function client(): S3Client {
    if (_client) return _client;
    const region = process.env.SPACES_REGION;
    const endpoint = process.env.SPACES_ENDPOINT;
    const accessKeyId = process.env.SPACES_KEY;
    const secretAccessKey = process.env.SPACES_SECRET;
    if (!region || !endpoint || !accessKeyId || !secretAccessKey) {
        throw new Error(
            'Object storage is not configured (set SPACES_REGION, SPACES_ENDPOINT, SPACES_KEY, SPACES_SECRET)'
        );
    }
    _client = new S3Client({
        region,
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: false,
    });
    return _client;
}

function bucket(): string {
    const b = process.env.SPACES_BUCKET;
    if (!b) throw new Error('Object storage is not configured (set SPACES_BUCKET)');
    return b;
}

/** True when uploads are possible; the admin UI uses this to explain itself. */
export function isBrandingStorageConfigured(): boolean {
    return Boolean(
        process.env.SPACES_REGION &&
        process.env.SPACES_ENDPOINT &&
        process.env.SPACES_BUCKET &&
        process.env.SPACES_KEY &&
        process.env.SPACES_SECRET
    );
}

/** Browser-reachable URL for a stored key (CDN base if one is configured). */
export function publicUrlFor(key: string): string {
    const override = process.env.SPACES_PUBLIC_BASE;
    if (override) return `${override.replace(/\/+$/, '')}/${key}`;
    // Virtual-hosted style: https://<bucket>.<endpoint-host>/<key>
    const host = new URL(process.env.SPACES_ENDPOINT as string).host;
    return `https://${bucket()}.${host}/${key}`;
}

export interface StoredBrandingAsset {
    /** Object key, persisted so the old asset can be deleted on replace. */
    key: string;
    /** Public URL persisted in settings and rendered by the UI. */
    url: string;
}

/**
 * Uploads a branding image. Small by definition, so the caller passes the whole
 * buffer — no streaming machinery needed. Throws on an unsupported type or an
 * oversized file so the route can surface a 400.
 */
export async function storeBrandingAsset(
    kind: BrandingAssetSlot,
    fileName: string,
    contentType: string | null,
    body: Buffer
): Promise<StoredBrandingAsset> {
    const declared = (contentType || '').split(';')[0].trim().toLowerCase();
    const fromName = path.extname(fileName).replace('.', '').toLowerCase();
    const ext =
        ALLOWED_TYPES[declared] ??
        (Object.values(ALLOWED_TYPES).includes(fromName) ? fromName : null);
    if (!ext) {
        throw new Error('Unsupported image type — use PNG, JPEG, WebP, SVG or ICO');
    }
    if (body.length > MAX_BRANDING_BYTES) {
        throw new Error(`Image is too large (max ${Math.round(MAX_BRANDING_BYTES / 1024 / 1024)}MB)`);
    }

    // Random suffix rather than a fixed name: the URL is cached hard by browsers
    // and CDNs, so each upload must be a fresh key to take effect immediately.
    const key = [KEY_PREFIX, `${kind}-${randomBytes(8).toString('hex')}.${ext}`].filter(Boolean).join('/');

    await client().send(
        new PutObjectCommand({
            Bucket: bucket(),
            Key: key,
            Body: body,
            ACL: 'public-read',
            ContentType: declared || `image/${ext}`,
            CacheControl: 'public, max-age=31536000, immutable',
        })
    );

    return { key, url: publicUrlFor(key) };
}

/** Best-effort delete of a replaced/removed asset; never throws. */
export async function deleteBrandingAsset(key: string): Promise<void> {
    try {
        await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    } catch {
        // ignore — object may already be gone, or storage may be unconfigured.
    }
}
