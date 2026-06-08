import { wrap, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { customerCredentialsSchema } from '@/lib/shared/domain/schemas/customer';
import { register } from '@/lib/shared/services/customer.service';

// POST /api/customer/auth/register - B2C customer registration
export const POST = wrap(async (request) => {
    const body = await parseBody(request, customerCredentialsSchema);
    return json(await register(body.email, body.password, body.fullName), { status: 201 });
});
