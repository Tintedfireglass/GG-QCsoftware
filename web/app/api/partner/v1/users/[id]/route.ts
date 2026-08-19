import { json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { updateUserSchema } from '@/lib/shared/domain/schemas/users';
import { deactivateUser, getUser, updateUser } from '@/lib/shared/services/users.service';

// Team membership is enforced in the service (canManageUser), so these need no
// role gate of their own — a key can only ever reach its owner's own team.

// GET /api/partner/v1/users/{id}
export const GET = withPartner('users:read', async (_request, { user, params }) =>
    json(await getUser(user, params.id))
);

// PATCH /api/partner/v1/users/{id} — partial update of the fields the panel exposes.
export const PATCH = withPartner('users:write', async (request, { user, params }) => {
    const body = await parseBody(request, updateUserSchema);
    return json(await updateUser(user, params.id, body));
});

// DELETE /api/partner/v1/users/{id} — deactivate. Soft delete: the row and its
// QC history are kept, the account can no longer sign in.
export const DELETE = withPartner('users:write', async (_request, { user, params }) =>
    json(await deactivateUser(user, params.id))
);

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
