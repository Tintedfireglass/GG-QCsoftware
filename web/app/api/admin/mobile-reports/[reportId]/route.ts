import { withAuth, json } from '@/lib/http/handler';
import { UserRole } from '@/lib/types';
import { getAdminReport } from '@/lib/platforms/android/services/admin-mobile-reports.service';

const MOBILE_REPORT_ROLES: UserRole[] = ['SuperAdmin', 'Reseller', 'Refurbisher', 'Enterprise', 'OEM', 'Insurer'];

// GET /api/admin/mobile-reports/[reportId] — full report (payload + stress samples), role-scoped.
export const GET = withAuth(MOBILE_REPORT_ROLES, async (_request, { user, params }) => {
    return json(await getAdminReport(user, params.reportId));
});
