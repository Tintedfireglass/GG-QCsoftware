import { withAuth, json } from '@/lib/http/handler';
import { listFreeTrials } from '@/lib/services/free-trials.service';

// GET /api/admin/free-trials - list all free trials (SuperAdmin only)
export const GET = withAuth(['SuperAdmin'], async () => {
    return json(await listFreeTrials());
});
