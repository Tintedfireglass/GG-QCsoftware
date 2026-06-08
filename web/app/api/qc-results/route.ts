import { authenticateRequest } from '@/lib/auth-middleware';
import { verifyApiKey } from '@/lib/auth';
import { wrap, withAuth, json, clientIp } from '@/lib/http/handler';
import { UnauthorizedError, UpgradeRequiredError } from '@/lib/http/errors';
import { parseBody, parseQuery } from '@/lib/http/validate';
import { listQuerySchema, submitSchema } from '@/lib/platforms/windows/domain/schemas/qc-results';
import { listResults, submitResult } from '@/lib/platforms/windows/services/qc-results.service';

const LIST_CACHE = 'private, max-age=5, stale-while-revalidate=25';

// GET all QC results (requires JWT authentication)
export const GET = withAuth(null, async (request, { user }) => {
    const q = parseQuery(request, listQuerySchema);
    return json(await listResults(user, q), { headers: { 'Cache-Control': LIST_CACHE } });
});

// POST submit new QC result (requires API key authentication)
export const POST = wrap(async (request) => {
    if (!verifyApiKey(request.headers.get('x-api-key'))) {
        throw new UnauthorizedError('Invalid API key');
    }

    const { user, error } = await authenticateRequest(request);
    if (error) return error;

    // Legacy clients submitted without a JWT; allow that only until the cutoff.
    const legacyWindowOpen = new Date() <= new Date('2026-04-12T23:59:59Z');
    if (!user && !legacyWindowOpen) {
        throw new UpgradeRequiredError('Please update to the latest version to submit results.');
    }

    const body = await parseBody(request, submitSchema);
    const result = await submitResult(body, user?.id ?? null, clientIp(request));

    return json({ message: 'QC result submitted successfully', ...result }, { status: 201 });
});
