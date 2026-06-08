import path from 'path';
import * as repo from '@/lib/shared/repositories/releases.repo';
import {
    buildRelativePath,
    storeReleaseFile,
    deleteReleaseFile,
    openReleaseFile,
} from '@/lib/shared/storage/releases-storage';
import { compareVersions, isOutdated } from '@/lib/shared/domain/version';
import { PLATFORM_EXTENSIONS, type Platform, type Channel } from '@/lib/shared/domain/schemas/releases';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/http/errors';

export async function listReleases() {
    return { releases: await repo.listReleases() };
}

export interface CreateReleaseInput {
    platform: Platform;
    channel: Channel;
    version: string;
    notes?: string;
    mandatory: boolean;
    publish: boolean;
    storeUrl?: string;
    /** Optional: a hosted installer. Omit for version-only / store-pointer releases. */
    file?: File | null;
    createdBy: number;
}

export async function createRelease(input: CreateReleaseInput) {
    const { platform, channel, version } = input;
    const file = input.file && input.file.size > 0 ? input.file : null;

    // A release is either a hosted file (Windows/Mac/APK) or a store pointer
    // (Play Store / App Store — version only). Require one of the two.
    if (!file && !input.storeUrl) {
        throw new ValidationError('Provide an installer file or a store URL');
    }

    if (file) {
        const ext = path.extname(file.name).toLowerCase();
        const allowed = PLATFORM_EXTENSIONS[platform];
        if (!allowed.includes(ext)) {
            throw new ValidationError(`${platform} installer must be one of: ${allowed.join(', ')}`);
        }
    }

    if (await repo.findByVersion(platform, channel, version)) {
        throw new ConflictError(`${platform}/${channel} version ${version} already exists`);
    }

    const base = {
        platform,
        channel,
        version,
        notes: input.notes?.trim() || null,
        mandatory: input.mandatory,
        storeUrl: input.storeUrl || null,
        isPublished: input.publish,
        createdBy: input.createdBy,
    };

    // Store-pointer release: no file to persist.
    if (!file) {
        return repo.insertRelease({
            ...base,
            fileName: null,
            filePath: null,
            fileSize: null,
            contentType: null,
            sha256: null,
        });
    }

    const relativePath = buildRelativePath(platform, channel, version, file.name);
    const stored = await storeReleaseFile(relativePath, file.stream());

    try {
        return await repo.insertRelease({
            ...base,
            fileName: file.name,
            filePath: stored.relativePath,
            fileSize: stored.size,
            contentType: file.type || null,
            sha256: stored.sha256,
        });
    } catch (err) {
        // Roll back the orphaned file if the DB insert fails.
        await deleteReleaseFile(relativePath).catch(() => {});
        throw err;
    }
}

export async function patchRelease(id: number, patch: repo.ReleasePatch) {
    const updated = await repo.updateRelease(id, patch);
    if (!updated) throw new NotFoundError('Release not found');
    return updated;
}

export async function removeRelease(id: number) {
    const existing = await repo.findReleaseById(id);
    if (!existing) throw new NotFoundError('Release not found');
    await repo.deleteReleaseRow(id);
    if (existing.filePath) await deleteReleaseFile(existing.filePath).catch(() => {});
    return { ok: true };
}

/** Highest published version for a platform/channel, or null if none. */
async function latestPublished(platform: Platform, channel: Channel) {
    const rows = await repo.listPublishedReleases(platform, channel);
    if (rows.length === 0) return null;
    return rows.reduce((best, r) =>
        compareVersions(String(r.version), String(best.version)) > 0 ? r : best
    );
}

/**
 * Public update manifest the desktop client polls. `current` is the client's
 * installed version (optional). `mandatory` is true if ANY published version
 * between `current` and latest is flagged mandatory — so a hard gate can't be
 * skipped by hopping a release.
 */
export async function getUpdateManifest(
    platform: Platform,
    channel: Channel,
    current: string | undefined,
    downloadBase: string
) {
    const latest = await latestPublished(platform, channel);
    if (!latest) throw new NotFoundError('No release published for this platform');

    const latestVersion = String(latest.version);
    const updateAvailable = isOutdated(current, latestVersion);

    let mandatory = Boolean(latest.mandatory);
    if (current && updateAvailable) {
        const rows = await repo.listPublishedReleases(platform, channel);
        mandatory = rows.some(
            (r) =>
                Boolean(r.mandatory) &&
                compareVersions(String(r.version), current) > 0 &&
                compareVersions(String(r.version), latestVersion) <= 0
        );
    }

    const hasFile = Boolean(latest.file_name);

    return {
        platform,
        channel,
        version: latestVersion,
        updateAvailable,
        mandatory,
        notes: latest.notes ?? null,
        // "file" = download & install a hosted binary; "store" = open the store link.
        kind: hasFile ? ('file' as const) : ('store' as const),
        // Where the client goes to update: our download endpoint, or the store URL.
        url: hasFile
            ? `${downloadBase}/api/updates/${platform}/download/${latest.id}`
            : (latest.store_url ?? null),
        sha256: hasFile ? latest.sha256 : null,
        size: hasFile ? Number(latest.file_size) : null,
        fileName: hasFile ? latest.file_name : null,
        publishedAt: latest.published_at,
    };
}

/** Resolve a release for download (must be published). Returns row + open stream. */
export async function openForDownload(id: number) {
    const row = await repo.findReleaseById(id);
    if (!row || !row.isPublished || !row.filePath) throw new NotFoundError('Release not found');

    let file;
    try {
        file = await openReleaseFile(row.filePath);
    } catch {
        throw new NotFoundError('Release file is missing on disk');
    }

    // Fire-and-forget analytics; never block the download on it.
    repo.incrementDownloadCount(id).catch(() => {});

    return { row, ...file };
}
