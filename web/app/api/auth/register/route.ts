import { withAuth, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { registerSchema } from '@/lib/shared/domain/schemas/auth';
import { register } from '@/lib/shared/services/auth.service';

// POST /api/auth/register - create a user (role-gated; hierarchy-checked in service)
export const POST = withAuth(['SuperAdmin', 'Refurbisher', 'Enterprise', 'Reseller'], async (request, { user }) => {
    const body = await parseBody(request, registerSchema);
    return json(await register(user, body), { status: 201 });
});
