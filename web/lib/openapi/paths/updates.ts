import type { RouteDoc } from '../types';

export const updateRoutes: RouteDoc[] = [
    {
        method: 'get',
        path: '/api/updates/{platform}/latest',
        tag: 'App Updates',
        summary: 'Latest release manifest',
        description: 'Public manifest the desktop/mobile clients poll to decide whether to self-update.',
        params: [
            { name: 'platform', in: 'path', description: 'Client platform.', schema: { type: 'string', enum: ['windows', 'android'] } },
            { name: 'current', in: 'query', description: 'Client’s current version, e.g. `1.2.0`.' },
            { name: 'channel', in: 'query', description: 'Release channel.', schema: { type: 'string', default: 'stable' } },
        ],
        responses: {
            '200': {
                description: 'Update manifest (or "no update" for the current version).',
                schema: {
                    type: 'object',
                    properties: {
                        version: { type: 'string', nullable: true },
                        url: { type: 'string', nullable: true },
                        notes: { type: 'string', nullable: true },
                        mandatory: { type: 'boolean' },
                    },
                },
            },
            '400': { description: 'Unknown platform.' },
        },
    },
];
