import { withAuth, json } from '@/lib/http/handler';
import { ValidationError } from '@/lib/http/errors';
import { parseBody } from '@/lib/http/validate';
import { updateReleaseSchema } from '@/lib/shared/domain/schemas/releases';
import { patchRelease, removeRelease } from '@/lib/shared/services/releases.service';

function parseId(params: Record<string, string>): number {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid release id');
    return id;
}

// PATCH /api/admin/releases/:id - publish/unpublish, toggle mandatory, edit notes (SuperAdmin)
export const PATCH = withAuth(['SuperAdmin'], async (request, { params }) => {
    const id = parseId(params);
    const patch = await parseBody(request, updateReleaseSchema);
    return json(await patchRelease(id, patch));
});

// DELETE /api/admin/releases/:id - remove a release + its file (SuperAdmin)
export const DELETE = withAuth(['SuperAdmin'], async (_request, { params }) => {
    const id = parseId(params);
    return json(await removeRelease(id));
});
