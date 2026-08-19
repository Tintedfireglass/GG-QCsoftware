import { withAuth, json } from '@/lib/http/handler';
import { ValidationError } from '@/lib/http/errors';
import { keyUsage } from '@/lib/partner/keys.service';

// GET /api/admin/partner-keys/{id}/usage?days=30 — request volume and error rate.
export const GET = withAuth(['SuperAdmin'], async (request, { user, params }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid key id');

    const raw = Number(request.nextUrl.searchParams.get('days') ?? 30);
    const days = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 90) : 30;
    return json(await keyUsage(user, id, days));
});
