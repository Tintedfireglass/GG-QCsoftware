import { withAuth, json } from '@/lib/http/handler';
import { parseQuery } from '@/lib/http/validate';
import { UserRole } from '@/lib/types';
import { adminMobileListQuerySchema } from '@/lib/platforms/android/domain/schemas/admin-mobile';
import { listAdminReports } from '@/lib/platforms/android/services/admin-mobile-reports.service';

const LIST_CACHE = 'private, max-age=5, stale-while-revalidate=25';

/** Roles allowed to view B2C mobile QC reports (reseller-scoped via license attribution). */
const MOBILE_REPORT_ROLES: UserRole[] = ['SuperAdmin', 'Reseller', 'Refurbisher', 'Enterprise', 'OEM', 'Insurer'];

// GET /api/admin/mobile-reports — list mobile reports, role-scoped.
export const GET = withAuth(MOBILE_REPORT_ROLES, async (request, { user }) => {
    const q = parseQuery(request, adminMobileListQuerySchema);
    return json(await listAdminReports(user, q), { headers: { 'Cache-Control': LIST_CACHE } });
});
