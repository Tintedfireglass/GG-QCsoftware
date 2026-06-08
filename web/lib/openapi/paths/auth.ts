import { loginSchema, registerSchema, licenseActivateSchema, trialSchema } from '@/lib/shared/domain/schemas/auth';
import type { RouteDoc } from '../types';

const tokenResponse = {
    type: 'object',
    properties: {
        token: { type: 'string', description: 'Signed JWT to send as `Authorization: Bearer <token>`.' },
        user: {
            type: 'object',
            properties: {
                id: { type: 'integer' },
                username: { type: 'string' },
                role: { type: 'string', example: 'SuperAdmin' },
                display_name: { type: 'string', nullable: true },
            },
        },
    },
} as const;

export const authRoutes: RouteDoc[] = [
    {
        method: 'get',
        path: '/api',
        tag: 'Meta',
        summary: 'API health check',
        description: 'Liveness probe that also reports database connectivity and a map of key endpoints.',
        responses: {
            '200': {
                description: 'API and database are reachable.',
                schema: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', example: 'OK' },
                        message: { type: 'string' },
                        database: {
                            type: 'object',
                            properties: { connected: { type: 'boolean' }, version: { type: 'string' } },
                        },
                    },
                },
            },
            '500': { description: 'Database connection failed.' },
        },
    },
    {
        method: 'post',
        path: '/api/auth/login',
        tag: 'Authentication',
        summary: 'Dashboard staff login',
        description: 'Exchanges username/email + password for a staff JWT used across the dashboard API.',
        body: { schema: loginSchema, example: { identifier: 'admin', password: 'secret' } },
        responses: {
            '200': { description: 'Authenticated.', schema: tokenResponse },
            '401': { description: 'Invalid credentials.' },
        },
    },
    {
        method: 'post',
        path: '/api/auth/register',
        tag: 'Authentication',
        summary: 'Create a staff user',
        description: 'Provisions a new staff account. Restricted to user-managing roles.',
        security: ['adminJWT'],
        body: { schema: registerSchema },
        responses: {
            '201': { description: 'User created.', schema: tokenResponse },
            '409': { description: 'Username or email already exists.' },
        },
    },
    {
        method: 'post',
        path: '/api/auth/license',
        tag: 'Authentication',
        summary: 'Activate a license (desktop)',
        description: 'Called by the C# desktop client to bind a license key to a machine and obtain access.',
        body: {
            schema: licenseActivateSchema,
            example: { licenseKey: 'PRMN-XXXX-XXXX', machineSerial: 'SN123', macAddress: '00:11:22:33:44:55', computerName: 'QC-PC-01' },
        },
        responses: {
            '200': { description: 'License activated.' },
            '403': { description: 'License invalid, expired, or fully consumed.' },
            '426': { description: 'Client version too old; upgrade required.' },
        },
    },
    {
        method: 'post',
        path: '/api/auth/trial',
        tag: 'Authentication',
        summary: 'Start a free trial (desktop)',
        description: 'Registers a free-trial activation for a device by email + machine identity.',
        body: { schema: trialSchema, example: { email: 'tech@shop.com', machineSerial: 'SN123', macAddress: '00:11:22:33:44:55' } },
        responses: {
            '200': { description: 'Trial started or resumed.' },
            '403': { description: 'Trial already used or not eligible.' },
        },
    },
];
