import { wrap, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { trialSchema } from '@/lib/shared/domain/schemas/auth';
import { activateTrial } from '@/lib/shared/services/auth.service';

// POST /api/auth/trial - activate or resume a 7-day free trial, issue a token
export const POST = wrap(async (request) => {
    const body = await parseBody(request, trialSchema);
    return json(await activateTrial(body));
});
