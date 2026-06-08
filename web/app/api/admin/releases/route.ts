import { withAuth, json } from '@/lib/http/handler';
import { ValidationError } from '@/lib/http/errors';
import { createReleaseSchema } from '@/lib/shared/domain/schemas/releases';
import { listReleases, createRelease } from '@/lib/shared/services/releases.service';

// Installers can be large; keep this on the Node runtime so we can stream to disk.
export const runtime = 'nodejs';

// GET /api/admin/releases - list all releases (SuperAdmin only)
export const GET = withAuth(['SuperAdmin'], async () => {
    return json(await listReleases());
});

// POST /api/admin/releases - upload a new installer (multipart/form-data, SuperAdmin only)
export const POST = withAuth(['SuperAdmin'], async (request, { user }) => {
    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        throw new ValidationError('Expected multipart/form-data upload');
    }

    // File is optional: store-pointer releases (Play Store / App Store) are version-only.
    const fileField = form.get('file');
    const file = fileField instanceof File && fileField.size > 0 ? fileField : null;

    const meta = createReleaseSchema.parse({
        platform: form.get('platform'),
        channel: form.get('channel') ?? undefined,
        version: form.get('version'),
        notes: form.get('notes') ?? undefined,
        mandatory: form.get('mandatory') ?? false,
        publish: form.get('publish') ?? false,
        storeUrl: form.get('storeUrl') ?? undefined,
    });

    const release = await createRelease({ ...meta, file, createdBy: user.id });
    return json(release, { status: 201 });
});
