import path from 'path';
import * as repo from '@/lib/shared/repositories/releases.repo';
import {
    deleteReleaseFile,
    openReleaseFile,
    type StoredFile,
} from '@/lib/shared/storage/releases-storage';
import { compareVersions, isOutdated } from '@/lib/shared/domain/version';
import { PLATFORM_EXTENSIONS, type Platform, type Channel } from '@/lib/shared/domain/schemas/releases';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/http/errors';

export async function listReleases() {
    return { releases: await repo.listReleases() };
}

export interface AssertCreatableInput {
    platform: Platform;
    channel: Channel;
    version: string;
    /** True if an installer file will be uploaded. */
    hasFile: boolean;
    /** Installer filename (for extension validation), when hasFile is true. */
    fileName?: string | null;
    storeUrl?: string | null;
}

/**
 * Validate release metadata + (optional) installer extension and ensure the
 * version is unique. Call this BEFORE streaming the upload to object storage so
 * a bad request is rejected without consuming (and storing) the file.
 */
export async function assertReleaseCreatable(input: AssertCreatableInput) {
    // A release is either a hosted file (Windows/Mac/APK) or a store pointer
    // (Play Store / App Store — version only). Require one of the two.
    if (!input.hasFile && !input.storeUrl) {
        throw new ValidationError('Provide an installer file or a store URL');
    }

    if (input.hasFile && input.fileName) {
        const ext = path.extname(input.fileName).toLowerCase();
        const allowed = PLATFORM_EXTENSIONS[input.platform];
        if (!allowed.includes(ext)) {
            throw new ValidationError(`${input.platform} installer must be one of: ${allowed.join(', ')}`);
        }
    }

    if (await repo.findByVersion(input.platform, input.channel, input.version)) {
        throw new ConflictError(`${input.platform}/${input.channel} version ${input.version} already exists`);
    }
}

export interface RecordReleaseInput {
    platform: Platform;
    channel: Channel;
    version: string;
    notes?: string;
    mandatory: boolean;
    publish: boolean;
    storeUrl?: string;
    createdBy: number;
    /**
     * Already-stored installer (from storeReleaseFile) plus its original name and
     * content type. Omit/null for a version-only store-pointer release.
     */
    stored?: { file: StoredFile; fileName: string; contentType: string | null } | null;
}

/**
 * Persist a release row. When `stored` is provided the installer is already in
 * object storage; if the DB insert fails we roll the orphaned object back.
 */
export async function recordRelease(input: RecordReleaseInput) {
    const base = {
        platform: input.platform,
        channel: input.channel,
        version: input.version,
        notes: input.notes?.trim() || null,
        mandatory: input.mandatory,
        storeUrl: input.storeUrl || null,
        isPublished: input.publish,
        createdBy: input.createdBy,
    };

    // Store-pointer release: no file to persist.
    if (!input.stored) {
        return repo.insertRelease({
            ...base,
            fileName: null,
            filePath: null,
            fileSize: null,
            contentType: null,
            sha256: null,
        });
    }

    const { file, fileName, contentType } = input.stored;
    try {
        return await repo.insertRelease({
            ...base,
            fileName,
            filePath: file.relativePath,
            fileSize: file.size,
            contentType,
            sha256: file.sha256,
        });
    } catch (err) {
        // Roll back the orphaned object if the DB insert fails.
        await deleteReleaseFile(file.relativePath).catch(() => {});
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

/**
 * Resolve the latest published, hosted installer for a platform/channel and open
 * it for download. Lets storefronts/clients link to a STABLE URL instead of
 * baking a volatile release id (which dies when a release is re-uploaded).
 */
export async function openLatestForDownload(platform: Platform, channel: Channel) {
    const latest = await latestPublished(platform, channel);
    if (!latest || !latest.file_name) {
        throw new NotFoundError('No release published for this platform');
    }
    return openForDownload(Number(latest.id));
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
