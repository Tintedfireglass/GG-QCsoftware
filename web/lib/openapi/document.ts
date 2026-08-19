import { assembleDocument } from './builder';
import type { RouteDoc, TagDoc } from './types';
import { authRoutes } from './paths/auth';
import { qcResultRoutes } from './paths/qc-results';
import { machineRoutes } from './paths/machines';
import { licenseRoutes } from './paths/licenses';
import { userRoutes } from './paths/users';
import { customerRoutes } from './paths/customer';
import { publicRoutes } from './paths/public';
import { mobileRoutes } from './paths/mobile';
import { updateRoutes } from './paths/updates';
import { partnerRoutes } from './paths/partner';

/** Sidebar groups, in display order. Each route's `tag` must match a name here. */
const tags: TagDoc[] = [
    { name: 'Meta', description: 'Health and discovery.' },
    { name: 'Authentication', description: 'Dashboard staff login/registration and desktop license activation.' },
    { name: 'QC Results', description: 'Submit and read quality-control reports.' },
    { name: 'Machines', description: 'Devices that have been tested.' },
    { name: 'Licenses', description: 'Generate, list, and toggle license keys.' },
    { name: 'Users', description: 'Staff user management.' },
    { name: 'Customer (B2C)', description: 'Storefront buyer accounts, licenses, and checkout.' },
    { name: 'Public', description: 'Unauthenticated endpoints: certificate verification, plans, guest checkout.' },
    { name: 'Mobile', description: 'Android app: phone+OTP auth and reports (alternate response envelope).' },
    { name: 'App Updates', description: 'Self-update manifests polled by desktop/mobile clients.' },
    { name: 'Partner API', description: 'Reseller integrations: versioned, key-authenticated, scoped and rate-limited.' },
];

const routes: RouteDoc[] = [
    ...authRoutes,
    ...qcResultRoutes,
    ...machineRoutes,
    ...licenseRoutes,
    ...userRoutes,
    ...customerRoutes,
    ...publicRoutes,
    ...mobileRoutes,
    ...updateRoutes,
    ...partnerRoutes,
];

/**
 * Build the full OpenAPI 3.1 document for the PRAMAAN / LaptopQC API.
 *
 * This is the single source rendered by the in-dashboard Scalar reference. To
 * document another endpoint, add a {@link RouteDoc} to the relevant file under
 * `lib/openapi/paths/` (reuse its Zod schema for the body) — it shows up here
 * automatically. New groups: add a tag above and a `*.ts` under `paths/`.
 */
export function buildOpenApiDocument(): Record<string, unknown> {
    return assembleDocument({
        info: {
            title: 'PRAMAAN / LaptopQC API',
            version: '1.0.0',
            description:
                'B2B2C quality-control platform API. Audiences: dashboard staff (JWT), B2C customers (JWT), the Android app (JWT), and the C# desktop client (`x-api-key`). This reference covers the core endpoints; see `lib/openapi/paths/` to extend it.',
        },
        servers: [{ url: '/', description: 'This host' }],
        tags,
        routes,
    });
}

/**
 * Build the *public* OpenAPI document — the partner surface only.
 *
 * Served unauthenticated at `/api/partner/v1/openapi.json` and rendered at
 * `/docs/api`, so it deliberately contains nothing but `/api/partner/v1/*`:
 * resellers should not be handed a map of the dashboard's internal endpoints.
 */
export function buildPartnerOpenApiDocument(brandName = 'Pramaan'): Record<string, unknown> {
    return assembleDocument({
        info: {
            title: `${brandName} Partner API`,
            version: '1.0.0',
            description:
                'Read and manage your own QC results, machines, licenses, team and fleet from your own backend.\n\n' +
                '**Authentication** — send your key as `x-api-key: pk_live_…` (or `Authorization: Bearer pk_live_…`). ' +
                'Keys are issued by your account manager, carry a fixed set of scopes, and can be revoked at any time. ' +
                'Call `GET /api/partner/v1/me` to confirm which scopes yours holds.\n\n' +
                '**Rate limits** — every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`; ' +
                'exceeding the limit returns `429` with `Retry-After`.\n\n' +
                '**Errors** — non-2xx responses are `{ "error": "...", "message": "..." }`.\n\n' +
                '**Scoping** — a key sees exactly what its owning account sees in the dashboard: its own records and those of the team it created. There is no way to widen that.',
        },
        servers: [{ url: '/', description: 'This host' }],
        tags: [{ name: 'Partner API', description: 'Reseller integration endpoints.' }],
        routes: partnerRoutes,
    });
}
