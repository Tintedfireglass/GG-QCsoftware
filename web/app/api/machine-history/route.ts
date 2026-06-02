import { authenticateRequest } from '@/lib/auth-middleware';
import { verifyApiKey } from '@/lib/auth';
import { wrap, json } from '@/lib/http/handler';
import { UnauthorizedError } from '@/lib/http/errors';
import { parseBody } from '@/lib/http/validate';
import { submitMachineHistorySchema } from '@/lib/domain/schemas/machine-history';
import { submitMachineHistory } from '@/lib/services/machine-history.service';

// POST /api/machine-history - submit component-grade history (API key + JWT)
export const POST = wrap(async (request) => {
    if (!verifyApiKey(request.headers.get('x-api-key'))) {
        throw new UnauthorizedError('Invalid API key');
    }
    const { user, error } = await authenticateRequest(request);
    if (error) return error;
    if (!user) throw new UnauthorizedError('Not authenticated');

    const body = await parseBody(request, submitMachineHistorySchema);
    return json(await submitMachineHistory(user.id, body), { status: 201 });
});
