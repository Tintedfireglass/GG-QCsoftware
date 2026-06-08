import { withAuth, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { generateLicenseSchema, toggleLicenseSchema } from '@/lib/shared/domain/schemas/licenses';
import { listLicenses, generateLicense, toggleLicense } from '@/lib/shared/services/licenses.service';

const MANAGE_ROLES = ['SuperAdmin', 'Employee', 'Refurbisher', 'Enterprise', 'Reseller', 'Client'] as const;
const TOGGLE_ROLES = ['SuperAdmin', 'Refurbisher', 'Enterprise', 'Reseller', 'Client'] as const;

// GET /api/licenses - list license keys created by / visible to the caller
export const GET = withAuth([...MANAGE_ROLES], async (_request, { user }) => {
    return json(await listLicenses(user));
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
