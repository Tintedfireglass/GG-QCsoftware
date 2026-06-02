import { withAuth, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { updateUserSchema } from '@/lib/domain/schemas/users';
import { getUser, updateUser, deactivateUser } from '@/lib/services/users.service';

// GET /api/users/[id] - single user (self, or within the caller's team)
export const GET = withAuth(null, async (_request, { user, params }) => {
    return json(await getUser(user, params.id));
});

// PUT /api/users/[id] - update user fields / allocate reseller credits
export const PUT = withAuth(null, async (request, { user, params }) => {
    const body = await parseBody(request, updateUserSchema);
    return json(await updateUser(user, params.id, body));
});

// DELETE /api/users/[id] - soft-delete (deactivate)
export const DELETE = withAuth(null, async (_request, { user, params }) => {
    return json(await deactivateUser(user, params.id));
});
