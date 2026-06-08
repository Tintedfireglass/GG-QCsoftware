import { createHash } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, rm, stat } from 'fs/promises';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import type { Platform, Channel } from '@/lib/shared/domain/schemas/releases';

/**
 * Local-disk storage for release installers. Binaries live OUTSIDE the Next
 * public/ tree (so they can't be fetched without going through the gated
 * download route) under RELEASES_DIR, default <cwd>/storage/releases.
 *
 * Layout: <RELEASES_DIR>/<platform>/<channel>/<version>-<safeName>
 */
export function releasesDir(): string {
    return process.env.RELEASES_DIR || path.join(process.cwd(), 'storage', 'releases');
}

function sanitizeName(name: string): string {
    return path.basename(name).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200) || 'installer.bin';
}

/** Relative storage key (also what's persisted as file_path). */
export function buildRelativePath(
    platform: Platform,
    channel: Channel,
    version: string,
    fileName: string
): string {
    return path.join(platform, channel, `${version}-${sanitizeName(fileName)}`);
}

export interface StoredFile {
    relativePath: string;
    size: number;
    sha256: string;
}

/**
 * Streams a web ReadableStream (from a multipart File) to disk while computing
 * its SHA-256 in a single pass — never buffers the whole installer in memory.
 */
export async function storeReleaseFile(
    relativePath: string,
    webStream: ReadableStream<Uint8Array>
): Promise<StoredFile> {
    const absPath = path.join(releasesDir(), relativePath);
    await mkdir(path.dirname(absPath), { recursive: true });

    const hash = createHash('sha256');
    let size = 0;
    const hasher = new Transform({
        transform(chunk, _enc, cb) {
            hash.update(chunk);
            size += chunk.length;
            cb(null, chunk);
        },
    });

    await pipeline(Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]), hasher, createWriteStream(absPath));

    return { relativePath, size, sha256: hash.digest('hex') };
}

/** Node read stream for the download route. Throws if the file is missing. */
export async function openReleaseFile(relativePath: string): Promise<{ stream: Readable; size: number }> {
    const absPath = path.join(releasesDir(), relativePath);
    const info = await stat(absPath); // throws ENOENT -> surfaced as 404 by caller
    return { stream: createReadStream(absPath), size: info.size };
}

/** Best-effort delete; never throws if the file is already gone. */
export async function deleteReleaseFile(relativePath: string): Promise<void> {
    const absPath = path.join(releasesDir(), relativePath);
    await rm(absPath, { force: true });
}
