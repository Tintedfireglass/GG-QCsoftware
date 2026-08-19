import { withAuth, json } from '@/lib/http/handler';
import { ValidationError } from '@/lib/http/errors';
import { revokeKey } from '@/lib/partner/keys.service';

// DELETE /api/admin/partner-keys/{id} — revoke immediately and permanently.
export const DELETE = withAuth(['SuperAdmin'], async (_request, { user, params }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid key id');
    await revokeKey(user, id);
    return json({ success: true });
});
