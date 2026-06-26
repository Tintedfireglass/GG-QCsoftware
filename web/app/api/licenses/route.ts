import { withAuth, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { generateLicenseSchema, toggleLicenseSchema } from '@/lib/shared/domain/schemas/licenses';
import { listLicenses, generateLicense, toggleLicense } from '@/lib/shared/services/licenses.service';

const MANAGE_ROLES = ['SuperAdmin', 'Employee', 'Refurbisher', 'Enterprise', 'Reseller', 'Client'] as const;
const TOGGLE_ROLES = ['SuperAdmin', 'Employee', 'Refurbisher', 'Enterprise', 'Reseller', 'Client'] as const;

// GET /api/licenses?search=&status=&sort=&page=&limit= - list keys visible to the caller
export const GET = withAuth([...MANAGE_ROLES], async (request, { user }) => {
    const sp = request.nextUrl.searchParams;
    const page = parseInt(sp.get('page') || '1', 10);
    const limit = parseInt(sp.get('limit') || '20', 10);
    return json(await listLicenses(user, {
        search: sp.get('search') || undefined,
        status: sp.get('status') || undefined,
        sort: sp.get('sort') || undefined,
        page: Number.isNaN(page) ? 1 : page,
        limit: Number.isNaN(limit) ? 20 : limit,
    }));
});

// POST /api/licenses - generate a new license key
export const POST = withAuth([...MANAGE_ROLES], async (request, { user }) => {
    const body = await parseBody(request, generateLicenseSchema);
    return json(await generateLicense(user, body));
});

// PATCH /api/licenses - toggle a key's active status
export const PATCH = withAuth([...TOGGLE_ROLES], async (request, { user }) => {
    const body = await parseBody(request, toggleLicenseSchema);
    return json(await toggleLicense(user, body));
});
