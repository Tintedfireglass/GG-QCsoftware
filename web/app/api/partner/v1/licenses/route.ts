import { json } from '@/lib/http/handler';
import { parseBody, parseQuery } from '@/lib/http/validate';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { licenseListQuerySchema } from '@/lib/partner/schemas';
import { TEAM_MANAGE_ROLES } from '@/lib/partner/scopes';
import { generateLicenseSchema } from '@/lib/shared/domain/schemas/licenses';
import { generateLicense, listLicenses } from '@/lib/shared/services/licenses.service';

// GET /api/partner/v1/licenses — license keys owned by the account, paginated.
export const GET = withPartner('licenses:read', async (request, { user }) =>
    json(await listLicenses(user, parseQuery(request, licenseListQuerySchema)))
);

// POST /api/partner/v1/licenses — generate a key. Spends the account's license
// credits and honours its duration/platform permissions, exactly as the panel does.
export const POST = withPartner(
    { scopes: 'licenses:write', roles: TEAM_MANAGE_ROLES },
    async (request, { user }) => {
        const body = await parseBody(request, generateLicenseSchema);
        return json(await generateLicense(user, body), { status: 201 });
    }
);

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
