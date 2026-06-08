import { wrap, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { customerCredentialsSchema } from '@/lib/shared/domain/schemas/customer';
import { login } from '@/lib/shared/services/customer.service';

// POST /api/customer/auth/login - B2C customer login
export const POST = wrap(async (request) => {
    const body = await parseBody(request, customerCredentialsSchema);
    return json(await login(body.email, body.password));
});
