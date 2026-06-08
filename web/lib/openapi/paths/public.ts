import type { RouteDoc } from '../types';

const verificationResponse = {
    type: 'object',
    properties: {
        verified: { type: 'boolean' },
        healthId: { type: 'string' },
        reportId: { type: 'string' },
        score: { type: 'number', nullable: true },
        grade: { type: 'string', example: 'A+' },
        gradeLabel: { type: 'string', example: 'Certified Premium' },
        certificationDate: { type: 'string', format: 'date-time' },
        validUntil: { type: 'string', format: 'date-time' },
        status: { type: 'string', enum: ['valid', 'expired'] },
        device: {
            type: 'object',
            properties: { manufacturer: { type: 'string', nullable: true }, model: { type: 'string', nullable: true } },
        },
    },
} as const;

export const publicRoutes: RouteDoc[] = [
    {
        method: 'get',
        path: '/api/verify/{health_id}',
        tag: 'Public',
        summary: 'Verify a PRAMAAN certificate',
        description: 'Public, read-only verification of a certificate by its Health ID. Exposes only a verification summary — no raw report data.',
        params: [{ name: 'health_id', in: 'path', description: 'The PRAMAAN Health ID printed on the certificate.' }],
        responses: {
            '200': { description: 'Verification summary.', schema: verificationResponse },
            '404': {
                description: 'No certificate for this Health ID.',
                schema: { type: 'object', properties: { verified: { type: 'boolean', example: false }, error: { type: 'string' } } },
            },
        },
    },
    {
        method: 'get',
        path: '/api/plans',
        tag: 'Public',
        summary: 'List public pricing plans',
        description: 'Active, publicly purchasable plans for the storefront.',
        responses: { '200': { description: 'Plans.', schema: { type: 'array', items: { type: 'object', additionalProperties: true } } } },
    },
    {
        method: 'post',
        path: '/api/public/checkout',
        tag: 'Public',
        summary: 'Guest checkout',
        description: 'Creates a payment order for an unauthenticated storefront purchase.',
        body: {
            schema: { type: 'object', properties: { planId: { type: 'integer' }, email: { type: 'string' }, couponCode: { type: 'string' } } },
        },
        responses: { '200': { description: 'Order created with gateway context.', schema: { type: 'object', additionalProperties: true } } },
    },
];
