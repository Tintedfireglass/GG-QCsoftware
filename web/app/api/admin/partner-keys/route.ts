import { withAuth, json } from '@/lib/http/handler';
import { ValidationError } from '@/lib/http/errors';
import { parseBody } from '@/lib/http/validate';
import { issueKeySchema } from '@/lib/partner/schemas';
import { issueKey, listKeys } from '@/lib/partner/keys.service';

// GET /api/admin/partner-keys?userId= — keys issued to one account.
export const GET = withAuth(['SuperAdmin'], async (request, { user }) => {
    const userId = Number(request.nextUrl.searchParams.get('userId'));
    if (!Number.isInteger(userId) || userId <= 0) throw new ValidationError('userId is required');
    return json({ keys: await listKeys(user, userId) });
});

// POST /api/admin/partner-keys — mint a key. The plaintext in the response is
// the only time it exists outside the caller's hands; only its hash is stored.
export const POST = withAuth(['SuperAdmin'], async (request, { user }) => {
    const body = await parseBody(request, issueKeySchema);
    const { key, plaintext } = await issueKey(user, body);
    return json({ key, plaintext }, { status: 201 });
});
