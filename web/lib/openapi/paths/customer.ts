import { customerCredentialsSchema } from '@/lib/shared/domain/schemas/customer';
import type { RouteDoc } from '../types';

const customerTokenResponse = {
    type: 'object',
    properties: {
        token: { type: 'string', description: 'Customer JWT for `Authorization: Bearer <token>`.' },
        customer: {
            type: 'object',
            properties: { id: { type: 'integer' }, email: { type: 'string' }, fullName: { type: 'string', nullable: true } },
        },
    },
} as const;

export const customerRoutes: RouteDoc[] = [
    {
        method: 'post',
        path: '/api/customer/auth/register',
        tag: 'Customer (B2C)',
        summary: 'Register a customer',
        body: { schema: customerCredentialsSchema, example: { email: 'buyer@example.com', password: 'secret', fullName: 'Asha R' } },
        responses: {
            '201': { description: 'Customer created.', schema: customerTokenResponse },
            '409': { description: 'Email already registered.' },
        },
    },
    {
        method: 'post',
        path: '/api/customer/auth/login',
        tag: 'Customer (B2C)',
        summary: 'Customer login',
        body: { schema: customerCredentialsSchema, example: { email: 'buyer@example.com', password: 'secret' } },
        responses: {
            '200': { description: 'Authenticated.', schema: customerTokenResponse },
            '401': { description: 'Invalid credentials.' },
        },
    },
    {
        method: 'get',
        path: '/api/customer/me',
        tag: 'Customer (B2C)',
        summary: 'Current customer profile',
        security: ['customerJWT'],
        responses: { '200': { description: 'Profile.', schema: { type: 'object', additionalProperties: true } } },
    },
    {
        method: 'get',
        path: '/api/customer/licenses',
        tag: 'Customer (B2C)',
        summary: 'List my licenses',
        description: 'Licenses owned by the authenticated customer.',
        security: ['customerJWT'],
        responses: { '200': { description: 'Licenses.', schema: { type: 'array', items: { type: 'object', additionalProperties: true } } } },
    },
    {
        method: 'post',
        path: '/api/customer/checkout',
        tag: 'Customer (B2C)',
        summary: 'Start checkout',
        description: 'Creates a payment order (Razorpay) for the authenticated customer and returns the order/payment context.',
        security: ['customerJWT'],
        body: {
            schema: { type: 'object', properties: { planId: { type: 'integer' }, couponCode: { type: 'string' } } },
            required: false,
        },
        responses: { '200': { description: 'Order created with gateway context.', schema: { type: 'object', additionalProperties: true } } },
    },
];
