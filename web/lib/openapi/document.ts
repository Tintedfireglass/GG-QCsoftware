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
