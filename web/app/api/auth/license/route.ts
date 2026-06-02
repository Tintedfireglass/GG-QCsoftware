import { wrap, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { licenseActivateSchema } from '@/lib/domain/schemas/auth';
import { activateLicense } from '@/lib/services/auth.service';

// POST /api/auth/license - activate a license key for a machine, issue a token
export const POST = wrap(async (request) => {
    const body = await parseBody(request, licenseActivateSchema);
    return json(await activateLicense(body));
});
