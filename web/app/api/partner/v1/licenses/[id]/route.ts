import { json } from '@/lib/http/handler';
import { ValidationError } from '@/lib/http/errors';
import { parseBody } from '@/lib/http/validate';
import { withPartner } from '@/lib/partner/auth';
import { partnerPreflight } from '@/lib/partner/cors';
import { licenseUpdateSchema } from '@/lib/partner/schemas';
import { TEAM_MANAGE_ROLES } from '@/lib/partner/scopes';
import { toggleLicense, updateLicenseExpiry } from '@/lib/shared/services/licenses.service';

// PATCH /api/partner/v1/licenses/{id} — activate/deactivate a key, or move its
// expiry. Send one field or the other; both in one call is ambiguous, so the
// expiry wins only when `is_active` is absent.
export const PATCH = withPartner(
    { scopes: 'licenses:write', roles: TEAM_MANAGE_ROLES },
    async (request, { user, params }) => {
        const id = Number(params.id);
        if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid license id');

        const body = await parseBody(request, licenseUpdateSchema);
        return json(
            body.is_active !== undefined
                ? await toggleLicense(user, { id, is_active: body.is_active })
                : await updateLicenseExpiry(user, { id, expires_at: body.expires_at ?? null })
        );
    }
);

// Browsers preflight before any keyed call; answered centrally so each route
// does not hand-roll one. Only origins registered on a key get CORS headers.
export const OPTIONS = partnerPreflight;
