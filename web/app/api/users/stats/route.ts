import { withAuth, json } from '@/lib/http/handler';
import { getUserStats } from '@/lib/shared/services/users.service';

// GET /api/users/stats - aggregate user counts (role-scoped)
export const GET = withAuth(['SuperAdmin', 'Employee', 'Refurbisher', 'Enterprise', 'OEM', 'Insurer', 'Reseller'], async (_request, { user }) => {
    return json(await getUserStats(user));
});
