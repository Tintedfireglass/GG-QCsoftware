import { withAuth, json } from '@/lib/http/handler';
import { parseQuery } from '@/lib/http/validate';
import { listUsersQuerySchema } from '@/lib/domain/schemas/users';
import { listUsers } from '@/lib/services/users.service';

// GET /api/users - list users visible to the caller (role-scoped, paginated)
export const GET = withAuth(['SuperAdmin', 'Refurbisher', 'Enterprise', 'Reseller'], async (request, { user }) => {
    const q = parseQuery(request, listUsersQuerySchema);
    return json(await listUsers(user, q));
});
