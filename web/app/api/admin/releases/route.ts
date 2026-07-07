import { Readable } from 'stream';
import Busboy from 'busboy';
import { withAuth, json } from '@/lib/http/handler';
import { ValidationError } from '@/lib/http/errors';
import { createReleaseSchema } from '@/lib/shared/domain/schemas/releases';
import {
    listReleases,
    assertReleaseCreatable,
    recordRelease,
} from '@/lib/shared/services/releases.service';
import {
    buildRelativePath,
    storeReleaseFile,
    type StoredFile,
} from '@/lib/shared/storage/releases-storage';

// Installers can be large; stay on the Node runtime and stream the multipart
// body straight to object storage instead of buffering it in memory.
export const runtime = 'nodejs';

// GET /api/admin/releases - list all releases (SuperAdmin only)
export const GET = withAuth(['SuperAdmin'], async () => {
    return json(await listReleases());
});

/** Parse the collected text fields into validated release metadata. */
function parseMeta(fields: Record<string, string>) {
    return createReleaseSchema.parse({
        platform: fields.platform,
        channel: fields.channel ?? undefined,
        arch: fields.arch ?? undefined,
        version: fields.version,
        notes: fields.notes ?? undefined,
        mandatory: fields.mandatory ?? false,
        publish: fields.publish ?? false,
        storeUrl: fields.storeUrl ?? undefined,
    });
}

// POST /api/admin/releases - upload a new installer (multipart/form-data, SuperAdmin only).
// The installer is streamed to object storage as it arrives — never fully buffered.
export const POST = withAuth(['SuperAdmin'], async (request, { user }) => {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
        throw new ValidationError('Expected multipart/form-data upload');
    }
    if (!request.body) throw new ValidationError('Empty request body');

    const fields: Record<string, string> = {};
    let fileResult: { file: StoredFile; fileName: string; contentType: string | null } | null = null;
    let fileError: unknown = null;

    const bb = Busboy({ headers: { 'content-type': contentType }, limits: { files: 1, fields: 20 } });

    // Resolves once the whole multipart body has been parsed. The actual upload
    // (filePromise) may still be in flight when this resolves — we await it after.
    let filePromise: Promise<void> | null = null;

    const parsed = new Promise<void>((resolve, reject) => {
        bb.on('field', (name, value) => {
            fields[name] = value;
        });

        bb.on('file', (name, stream, info) => {
            // Only one installer field is expected. Drain anything unexpected (or a
            // second file) so busboy can still reach 'close'.
            if (name !== 'file' || filePromise || !info.filename) {
                stream.resume();
                return;
            }
            // The admin form appends the file LAST, so all metadata fields are already
            // collected here — validate and build the storage key before consuming it.
            filePromise = (async () => {
                const meta = parseMeta(fields);
                await assertReleaseCreatable({
                    platform: meta.platform,
                    channel: meta.channel,
                    arch: meta.arch,
                    version: meta.version,
                    hasFile: true,
                    fileName: info.filename,
                });
                const key = buildRelativePath(meta.platform, meta.channel, meta.arch, meta.version, info.filename);
                const stored = await storeReleaseFile(key, stream);
                fileResult = { file: stored, fileName: info.filename, contentType: info.mimeType || null };
            })().catch((err) => {
                // Capture the error and drain the stream so busboy can finish; the
                // route surfaces it after parsing completes.
                fileError = err;
                stream.resume();
            });
        });

        bb.on('error', reject);
        bb.on('close', () => resolve());

        Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]).pipe(bb);
    });

    await parsed;
    if (filePromise) await filePromise;
    if (fileError) throw fileError;

    const meta = parseMeta(fields);

    if (fileResult) {
        const release = await recordRelease({ ...meta, stored: fileResult, createdBy: user.id });
        return json(release, { status: 201 });
    }

    // No file part: store-pointer release (assertReleaseCreatable enforces one-of).
    await assertReleaseCreatable({
        platform: meta.platform,
        channel: meta.channel,
        arch: meta.arch,
        version: meta.version,
        hasFile: false,
        storeUrl: meta.storeUrl ?? null,
    });
    const release = await recordRelease({ ...meta, stored: null, createdBy: user.id });
    return json(release, { status: 201 });
});
