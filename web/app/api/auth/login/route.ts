import { wrap, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { loginSchema } from '@/lib/domain/schemas/auth';
import { login } from '@/lib/services/auth.service';

// POST /api/auth/login - username/email + password login
export const POST = wrap(async (request) => {
    const body = await parseBody(request, loginSchema);
    return json(await login(body));
});
