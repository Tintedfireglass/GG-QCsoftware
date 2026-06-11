import { createHash } from 'crypto';
import path from 'path';
import { Readable, Transform } from 'stream';
import {
    S3Client,
    GetObjectCommand,
    DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Platform, Channel } from '@/lib/shared/domain/schemas/releases';

/**
 * Object-storage (DigitalOcean Spaces / any S3-compatible) backend for release
 * installers. The app runs on DO App Platform, whose container filesystem is
 * ephemeral (wiped on every deploy/restart/scale) — so installers MUST live in
 * external object storage, not on local disk.
 *
 * Binaries are private objects fetched only through the gated download route
 * (we stream them server-side; the bucket is never exposed publicly).
 *
 * Object key layout: <SPACES_PREFIX>/<platform>/<channel>/<version>-<safeName>
 *
 * Required env: SPACES_REGION, SPACES_ENDPOINT, SPACES_BUCKET, SPACES_KEY,
 * SPACES_SECRET. Optional: SPACES_PREFIX (default "releases").
 */

const KEY_PREFIX = (process.env.SPACES_PREFIX ?? 'releases').replace(/^\/+|\/+$/g, '');

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
        // Spaces uses virtual-hosted-style addressing against the regional endpoint.
        forcePathStyle: false,
    });
    return _client;
}

function bucket(): string {
    const b = process.env.SPACES_BUCKET;
    if (!b) throw new Error('Object storage is not configured (set SPACES_BUCKET)');
    return b;
}

function sanitizeName(name: string): string {
    return path.basename(name).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200) || 'installer.bin';
}

/** Object key (also what's persisted as file_path). Always forward-slashed. */
export function buildRelativePath(
    platform: Platform,
    channel: Channel,
    version: string,
    fileName: string
): string {
    return [KEY_PREFIX, platform, channel, `${version}-${sanitizeName(fileName)}`]
        .filter(Boolean)
        .join('/');
}

export interface StoredFile {
    relativePath: string;
    size: number;
    sha256: string;
}

/**
 * Streams an installer (a Node Readable from a multipart parser, or a web
 * ReadableStream) up to object storage while computing its SHA-256 in a single
 * pass — never buffers the whole installer in memory. Uses multipart upload for
 * large binaries.
 */
export async function storeReleaseFile(
    relativePath: string,
    input: Readable | ReadableStream<Uint8Array>
): Promise<StoredFile> {
    const hash = createHash('sha256');
    let size = 0;
    const hasher = new Transform({
        transform(chunk, _enc, cb) {
            hash.update(chunk);
            size += chunk.length;
            cb(null, chunk);
        },
    });

    const nodeStream =
        input instanceof Readable
            ? input
            : Readable.fromWeb(input as Parameters<typeof Readable.fromWeb>[0]);
    const source = nodeStream.pipe(hasher);

    const upload = new Upload({
        client: client(),
        params: {
            Bucket: bucket(),
            Key: relativePath,
            Body: source,
            ACL: 'private',
        },
        partSize: 8 * 1024 * 1024,
        queueSize: 4,
    });
    await upload.done();

    return { relativePath, size, sha256: hash.digest('hex') };
}

/** Node read stream for the download route. Throws if the object is missing. */
export async function openReleaseFile(
    relativePath: string
): Promise<{ stream: Readable; size: number }> {
    // NoSuchKey throws here -> surfaced as 404 by the caller.
    const res = await client().send(
        new GetObjectCommand({ Bucket: bucket(), Key: relativePath })
    );
    const stream = res.Body as Readable;
    const size = Number(res.ContentLength ?? 0);
    return { stream, size };
}

/** Best-effort delete; never throws if the object is already gone. */
export async function deleteReleaseFile(relativePath: string): Promise<void> {
    try {
        await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: relativePath }));
    } catch {
        // ignore — object may already be absent, or storage may be unconfigured.
    }
}
