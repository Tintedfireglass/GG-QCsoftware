import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { wrap } from '@/lib/http/handler';
import { NotFoundError } from '@/lib/http/errors';
import { brandingKeyForAssetName, openBrandingAsset } from '@/lib/shared/storage/branding-storage';

// Streams from object storage via the AWS SDK — Node runtime, not edge.
export const runtime = 'nodejs';

/**
 * GET /api/branding/asset/<file-name> - serve an uploaded branding image.
 *
 * Public on purpose: logos are rendered to anonymous visitors on /verify and
 * /report and on the login page. The objects themselves stay private in the
 * bucket — DigitalOcean rejects the public-read ACL that used to make them
 * directly reachable, and the same bucket holds the installers — so this route
 * is what a browser actually fetches. Only the file name is in the URL;
 * brandingKeyForAssetName() rebuilds the key, so nothing else in the bucket is
 * reachable through here.
 */
export const GET = wrap(async (_request, { params }) => {
    const key = brandingKeyForAssetName(params.name ?? '');
    if (!key) throw new NotFoundError('Asset not found');

    let asset;
    try {
        asset = await openBrandingAsset(key);
    } catch {
        throw new NotFoundError('Asset not found');
    }

    const body = Readable.toWeb(asset.stream) as unknown as ReadableStream<Uint8Array>;
    return new NextResponse(body, {
        status: 200,
        headers: {
            'Content-Type': asset.contentType,
            ...(asset.size ? { 'Content-Length': String(asset.size) } : {}),
            // Every upload writes a fresh random key, so a replaced logo is a
            // new URL and this can be cached as hard as the bucket allows.
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    });
});
