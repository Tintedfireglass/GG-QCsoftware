import { generateLicenseSchema, toggleLicenseSchema } from '@/lib/shared/domain/schemas/licenses';
import type { RouteDoc } from '../types';

const license = {
    type: 'object',
    properties: {
        id: { type: 'integer' },
        license_key: { type: 'string', example: 'PRMN-XXXX-XXXX' },
        type: { type: 'string', enum: ['single_use', 'bulk', 'demo'] },
        max_uses: { type: 'integer', nullable: true },
        current_uses: { type: 'integer' },
        is_active: { type: 'boolean' },
        expires_at: { type: 'string', format: 'date-time', nullable: true },
    },
} as const;

export const licenseRoutes: RouteDoc[] = [
    {
        method: 'get',
        path: '/api/licenses',
        tag: 'Licenses',
        summary: 'List licenses',
        description: 'License keys the caller manages, grouped/scoped by role.',
        security: ['adminJWT'],
        responses: { '200': { description: 'Licenses.', schema: { type: 'array', items: license } } },
    },
    {
        method: 'post',
        path: '/api/licenses',
        tag: 'Licenses',
        summary: 'Generate a license',
        description:
            'Creates one or more license keys. `platform_caps` (per-platform device caps) is authoritative when present and determines `product_scope` and `max_uses`. Deducts the caller’s credits.',
        security: ['adminJWT'],
        body: {
            schema: generateLicenseSchema,
            example: { type: 'bulk', platform_caps: { windows: 2, android: 3 }, expires_at: '2026-12-31' },
        },
        responses: { '201': { description: 'License(s) created.', schema: license } },
    },
    {
        method: 'patch',
        path: '/api/licenses',
        tag: 'Licenses',
        summary: 'Toggle a license',
        description: 'Activates or deactivates a license by id.',
        security: ['adminJWT'],
        body: { schema: toggleLicenseSchema, example: { id: 42, is_active: false } },
        responses: {
            '200': { description: 'Updated license.', schema: license },
            '404': { description: 'License not found.' },
        },
    },
];
