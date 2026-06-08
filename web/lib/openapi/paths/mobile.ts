import { requestOtpSchema, verifyOtpSchema } from '@/lib/platforms/android/domain/schemas/mobile';
import type { RouteDoc } from '../types';

/**
 * Mobile routes use a different envelope than the rest of the API:
 *   success → { success: true, data?, message? }
 *   error   → { success: false, error: { code, message, details? } }
 */
const ok = (dataSchema: Record<string, unknown>) => ({
    type: 'object',
    properties: { success: { type: 'boolean', example: true }, data: dataSchema },
});

export const mobileRoutes: RouteDoc[] = [
    {
        method: 'post',
        path: '/api/mobile/auth/request-otp',
        tag: 'Mobile',
        summary: 'Request a login OTP',
        description: 'Sends a one-time passcode to the given phone number via the configured SMS provider.',
        body: { schema: requestOtpSchema, example: { phone: '9876543210', countryCode: '+91' } },
        responses: { '200': { description: 'OTP dispatched.', schema: ok({ type: 'object', additionalProperties: true }) } },
    },
    {
        method: 'post',
        path: '/api/mobile/auth/verify-otp',
        tag: 'Mobile',
        summary: 'Verify OTP and sign in',
        description: 'Verifies the OTP, creating the account on first login, and returns a mobile JWT.',
        body: { schema: verifyOtpSchema, example: { phone: '9876543210', otp: '1234', countryCode: '+91' } },
        responses: {
            '200': {
                description: 'Authenticated; token returned in `data`.',
                schema: ok({ type: 'object', properties: { token: { type: 'string' }, user: { type: 'object', additionalProperties: true } } }),
            },
        },
    },
    {
        method: 'get',
        path: '/api/mobile/user/profile',
        tag: 'Mobile',
        summary: 'Get my profile',
        security: ['mobileJWT'],
        responses: { '200': { description: 'Profile in `data`.', schema: ok({ type: 'object', additionalProperties: true }) } },
    },
];
