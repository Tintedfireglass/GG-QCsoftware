import { randomBytes } from 'crypto';
import type { Readable } from 'stream';
import path from 'path';
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from '@aws-sdk/client-s3';

/**
 * Object-storage backend for white-label branding assets (logo, favicon, login
 * illustration). Same DigitalOcean Spaces / S3-compatible bucket the release
 * installers use — the container filesystem is ephemeral, so uploaded artwork
 * cannot live on local disk.
 *
 * Unlike installers, branding assets have to be readable by a browser. They are
 * NOT uploaded with a public ACL: DigitalOcean disables per-object ACLs on
 * current Spaces buckets and rejects the request outright
 * (UnsupportedAclConfigurationException), which silently broke every logo
 * upload. The bucket also holds the installers, so making it public wholesale
 * is not an option either. Instead the objects stay private and are served
 * through /api/branding/asset/<key>, the same way installers are streamed.
 *
 * Object key layout: <SPACES_BRANDING_PREFIX>/<kind>-<random>.<ext>
 *
 * Required env: SPACES_REGION, SPACES_ENDPOINT, SPACES_BUCKET, SPACES_KEY,
 * SPACES_SECRET. Optional: SPACES_BRANDING_PREFIX (default "branding"),
 * SPACES_PUBLIC_BASE (CDN origin — only set this when the bucket really is
 * publicly readable; without it assets go through the proxy route).
 */

const KEY_PREFIX = (process.env.SPACES_BRANDING_PREFIX ?? 'branding').replace(/^\/+|\/+$/g, '');

/** Platform-wide branding slots an admin can replace via System Settings. */
export const BRANDING_ASSET_KINDS = ['logo', 'favicon', 'loginImage'] as const;
export type BrandingAssetKind = (typeof BRANDING_ASSET_KINDS)[number];

/**
 * Slots stored in the same bucket but owned by a row rather than by settings.
 * Only the key prefix differs, so reseller artwork is still recognisable in the
 * bucket without a second storage module.
 */
export const RESELLER_ASSET_SLOTS = ['resellerLogo', 'resellerFavicon'] as const;
export type BrandingAssetSlot = BrandingAssetKind | (typeof RESELLER_ASSET_SLOTS)[number];

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

/** Path prefix of the route that streams a private branding object. */
export const BRANDING_ASSET_ROUTE = '/api/branding/asset';

/**
 * Browser-reachable URL for a stored key.
 *
 * Defaults to the same-origin proxy route, because the bucket is private (see
 * the note at the top of this file). `SPACES_PUBLIC_BASE` overrides it with a
 * CDN/public origin for deployments whose bucket really is world-readable.
 *
 * Relative on purpose: the URL is persisted, and a reseller reaches the panel on
 * their own domain, so a path serves the logo from whichever host is asking.
 */
export function publicUrlFor(key: string): string {
    const override = process.env.SPACES_PUBLIC_BASE;
    if (override) return `${override.replace(/\/+$/, '')}/${key}`;
    // Only the file name travels in the URL; the route puts the prefix back, so
    // there is no way to point it at anything outside the branding prefix.
    const name = key.split('/').pop() as string;
    return `${BRANDING_ASSET_ROUTE}/${encodeURIComponent(name)}`;
}

/**
 * Object key behind an asset file name from a proxy-route URL, or null when the
 * name is not one storeBrandingAsset could have written. Branding objects are
 * the only thing in this bucket a browser may read — the installers beside them
 * are gated behind the release routes — so the name must match exactly the
 * `<kind>-<hex>.<ext>` shape we generate.
 */
export function brandingKeyForAssetName(name: string): string | null {
    const kinds = [...BRANDING_ASSET_KINDS, ...RESELLER_ASSET_SLOTS].join('|');
    if (!new RegExp(`^(?:${kinds})-[0-9a-f]+\\.[a-z0-9]+$`).test(name)) return null;
    return [KEY_PREFIX, name].filter(Boolean).join('/');
}

/** Opens a stored branding object for streaming. Throws when the key is absent. */
export async function openBrandingAsset(
    key: string
): Promise<{ stream: Readable; size: number; contentType: string }> {
    const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    return {
        stream: res.Body as Readable,
        size: Number(res.ContentLength ?? 0),
        contentType: res.ContentType || 'application/octet-stream',
    };
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
            // No ACL: current Spaces buckets reject per-object ACLs. The object
            // is reachable through BRANDING_ASSET_ROUTE instead.
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
