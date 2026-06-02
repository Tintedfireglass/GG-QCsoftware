import { withAuth, json } from '@/lib/http/handler';
import { getUserStats } from '@/lib/services/users.service';

// GET /api/users/stats - aggregate user counts (role-scoped)
export const GET = withAuth(['SuperAdmin', 'Refurbisher', 'Enterprise', 'Reseller'], async (_request, { user }) => {
    return json(await getUserStats(user));
});
