import type { RouteDoc } from '../types';

const ADMIN = ['adminJWT'] as const;

const user = {
    type: 'object',
    properties: {
        id: { type: 'integer' },
        username: { type: 'string' },
        email: { type: 'string', nullable: true },
        role: { type: 'string', example: 'Refurbisher' },
        display_name: { type: 'string', nullable: true },
        credits_left: { type: 'integer', nullable: true },
    },
} as const;

export const userRoutes: RouteDoc[] = [
    {
        method: 'get',
        path: '/api/users',
        tag: 'Users',
        summary: 'List users',
        description: 'Staff users visible to the caller (created-by or self, by role). Paginated.',
        security: [...ADMIN],
        params: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', description: 'Page size.', schema: { type: 'integer', default: 50 } },
        ],
        responses: {
            '200': {
                description: 'A page of users.',
                schema: { type: 'object', properties: { users: { type: 'array', items: user }, total: { type: 'integer' } } },
            },
        },
    },
    {
        method: 'get',
        path: '/api/users/me',
        tag: 'Users',
        summary: 'Current user profile',
        description: 'Returns the authenticated staff user — used by the dashboard to refresh permissions without re-login.',
        security: [...ADMIN],
        responses: { '200': { description: 'The current user.', schema: { type: 'object', properties: { user } } } },
    },
    {
        method: 'get',
        path: '/api/users/stats',
        tag: 'Users',
        summary: 'User statistics',
        description: 'Aggregate counts (totals by role, etc.) for the user-management dashboard.',
        security: [...ADMIN],
        responses: { '200': { description: 'Stats object.', schema: { type: 'object', additionalProperties: true } } },
    },
];
