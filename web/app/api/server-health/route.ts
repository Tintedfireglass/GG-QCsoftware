import { withAuth, json } from '@/lib/http/handler';
import { submitServerHealth } from '@/lib/shared/services/server-health.service';

// POST /api/server-health - submit a server health report (JWT / device token)
export const POST = withAuth(null, async (request, { user }) => {
    const body = await request.json().catch(() => null);
    return json(await submitServerHealth(user, body), { status: 201 });
});
