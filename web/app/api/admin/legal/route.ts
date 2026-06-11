import { withAuth, json } from '@/lib/http/handler';
import * as legal from '@/lib/shared/services/legal.service';

export const GET = withAuth(['SuperAdmin'], async () => {
    return json({ legal: await legal.getLegalContent() });
});

export const PUT = withAuth(['SuperAdmin'], async (request) => {
    const body = await request.json();
    const updated = await legal.updateLegalContent(body || {}, new Date().toISOString());
    return json({ legal: updated });
});
