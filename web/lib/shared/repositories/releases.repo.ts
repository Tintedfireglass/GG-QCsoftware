import { and, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';
import type { Platform, Channel, Arch } from '@/lib/shared/domain/schemas/releases';

const { appReleases } = schema;

// Explicit snake_case projection so API/UI keys match the rows.
const releaseColumns = {
    id: appReleases.id,
    platform: appReleases.platform,
    channel: appReleases.channel,
    arch: appReleases.arch,
    version: appReleases.version,
    notes: appReleases.notes,
    mandatory: appReleases.mandatory,
    store_url: appReleases.storeUrl,
    file_name: appReleases.fileName,
    file_size: appReleases.fileSize,
    content_type: appReleases.contentType,
    sha256: appReleases.sha256,
    is_published: appReleases.isPublished,
    download_count: appReleases.downloadCount,
    created_by: appReleases.createdBy,
    created_at: appReleases.createdAt,
    published_at: appReleases.publishedAt,
};

export interface NewRelease {
    platform: Platform;
    channel: Channel;
    arch: Arch;
    version: string;
    notes: string | null;
    mandatory: boolean;
    storeUrl: string | null;
    fileName: string | null;
    filePath: string | null;
    fileSize: number | null;
    contentType: string | null;
    sha256: string | null;
    isPublished: boolean;
    createdBy: number;
}

/** Admin list — all releases, newest first. */
export async function listReleases(): Promise<Record<string, unknown>[]> {
    const rows = await db.select(releaseColumns).from(appReleases).orderBy(desc(appReleases.createdAt));
    return rows as Record<string, unknown>[];
}

/** All PUBLISHED releases for a platform+channel (caller picks the latest by semver). */
export async function listPublishedReleases(platform: Platform, channel: Channel) {
    return db
        .select(releaseColumns)
        .from(appReleases)
        .where(
            and(
                eq(appReleases.platform, platform),
                eq(appReleases.channel, channel),
                eq(appReleases.isPublished, true)
            )
        );
}

/** Full row incl. file_path — used by the download route and delete. */
export async function findReleaseById(id: number) {
    const rows = await db.select().from(appReleases).where(eq(appReleases.id, id)).limit(1);
    return rows[0] ?? null;
}

export async function findByVersion(platform: Platform, channel: Channel, arch: Arch, version: string) {
    const rows = await db
        .select()
        .from(appReleases)
        .where(
            and(
                eq(appReleases.platform, platform),
                eq(appReleases.channel, channel),
                eq(appReleases.arch, arch),
                eq(appReleases.version, version)
            )
        )
        .limit(1);
    return rows[0] ?? null;
}

export async function insertRelease(data: NewRelease) {
    const rows = await db
        .insert(appReleases)
        .values({
            platform: data.platform,
            channel: data.channel,
            arch: data.arch,
            version: data.version,
            notes: data.notes,
            mandatory: data.mandatory,
            storeUrl: data.storeUrl,
            fileName: data.fileName,
            filePath: data.filePath,
            fileSize: data.fileSize,
            contentType: data.contentType,
            sha256: data.sha256,
            isPublished: data.isPublished,
            createdBy: data.createdBy,
            publishedAt: data.isPublished ? new Date().toISOString() : null,
        })
        .returning(releaseColumns);
    return rows[0];
}

export interface ReleasePatch {
    notes?: string | null;
    mandatory?: boolean;
    isPublished?: boolean;
    storeUrl?: string | null;
}

export async function updateRelease(id: number, patch: ReleasePatch) {
    const values: Record<string, unknown> = {};
    if (patch.notes !== undefined) values.notes = patch.notes;
    if (patch.mandatory !== undefined) values.mandatory = patch.mandatory;
    if (patch.storeUrl !== undefined) values.storeUrl = patch.storeUrl;
    if (patch.isPublished !== undefined) {
        values.isPublished = patch.isPublished;
        values.publishedAt = patch.isPublished ? new Date().toISOString() : null;
    }
    const rows = await db.update(appReleases).set(values).where(eq(appReleases.id, id)).returning(releaseColumns);
    return rows[0] ?? null;
}

export async function deleteReleaseRow(id: number) {
    const rows = await db.delete(appReleases).where(eq(appReleases.id, id)).returning({ filePath: appReleases.filePath });
    return rows[0] ?? null;
}

export async function incrementDownloadCount(id: number): Promise<void> {
    await db
        .update(appReleases)
        .set({ downloadCount: sql`${appReleases.downloadCount} + 1` })
        .where(eq(appReleases.id, id));
}
