import { json } from '@/lib/http/handler';
import { parseBody, parseQuery } from '@/lib/http/validate';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { userListQuerySchema } from '@/lib/partner/schemas';
import { TEAM_MANAGE_ROLES } from '@/lib/partner/scopes';
import { registerSchema } from '@/lib/shared/domain/schemas/auth';
import { register } from '@/lib/shared/services/auth.service';
import { listUsers } from '@/lib/shared/services/users.service';

// GET /api/partner/v1/users — the account's own team, paginated.
export const GET = withPartner(
    { scopes: 'users:read', roles: TEAM_MANAGE_ROLES },
    async (request, { user }) => json(await listUsers(user, parseQuery(request, userListQuerySchema)))
);

// POST /api/partner/v1/users — create a team member. The creatable roles are
// decided by the caller's own role (getCreatableRoles), not by the request.
export const POST = withPartner(
    { scopes: 'users:write', roles: TEAM_MANAGE_ROLES },
    async (request, { user }) => {
        const body = await parseBody(request, registerSchema);
        return json(await register(user, body), { status: 201 });
    }
);

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
