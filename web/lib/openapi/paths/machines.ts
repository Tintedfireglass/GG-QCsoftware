import { updateMachineSchema } from '@/lib/platforms/windows/domain/schemas/machines';
import type { RouteDoc } from '../types';

const machine = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        custom_name: { type: 'string', nullable: true },
        manufacturer: { type: 'string', nullable: true },
        model: { type: 'string', nullable: true },
        last_seen: { type: 'string', format: 'date-time', nullable: true },
        archived_at: { type: 'string', format: 'date-time', nullable: true },
        report_count: { type: 'integer' },
    },
} as const;

export const machineRoutes: RouteDoc[] = [
    {
        method: 'get',
        path: '/api/machines',
        tag: 'Machines',
        summary: 'List machines',
        description: 'Machines visible to the caller, excluding archived ones. Pass `archived=true` for the archive instead, or `countOnly=1` for just the visible count (dashboard cards).',
        security: ['adminJWT'],
        params: [
            { name: 'countOnly', in: 'query', description: 'Set `1`/`true` to return only `{ count }`.', schema: { type: 'string', enum: ['1', 'true'] } },
            { name: 'archived', in: 'query', description: 'Set `true` to list archived machines instead of active ones.', schema: { type: 'string', enum: ['true'] } },
        ],
        responses: {
            '200': {
                description: 'A list of machines, or `{ count }` when `countOnly` is set.',
                schema: { type: 'array', items: machine },
            },
        },
    },
    {
        method: 'get',
        path: '/api/machines/{id}',
        tag: 'Machines',
        summary: 'Get a machine',
        security: ['adminJWT'],
        params: [{ name: 'id', in: 'path', description: 'Machine id.' }],
        responses: {
            '200': { description: 'The machine.', schema: machine },
            '404': { description: 'Not found or not visible.' },
        },
    },
    {
        method: 'patch',
        path: '/api/machines/{id}',
        tag: 'Machines',
        summary: 'Update a machine',
        description: 'Sets the human-friendly `customName` and/or the archive state. Fields left out are untouched; `archived: true` moves the machine to the archive, `false` restores it.',
        security: ['adminJWT'],
        params: [{ name: 'id', in: 'path', description: 'Machine id.' }],
        body: { schema: updateMachineSchema, example: { customName: 'Front-desk QC PC', archived: false } },
        responses: {
            '200': { description: 'Updated machine.', schema: machine },
            '404': { description: 'Not found or not visible.' },
        },
    },
];
