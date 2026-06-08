import type { SecurityScheme } from './types';

/**
 * The four ways a caller proves identity to this API. These map to the auth
 * helpers in `lib/http`:
 *  - adminJWT    → `withAuth(...)` / `authenticateRequest` (dashboard staff)
 *  - customerJWT → `requireCustomer` (B2C buyers)
 *  - mobileJWT   → `lib/platforms/android/http` (phone app users)
 *  - apiKey      → `verifyApiKey` (`x-api-key`, the C# desktop client)
 */
export const securitySchemes: Record<SecurityScheme, Record<string, unknown>> = {
    adminJWT: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Dashboard staff JWT from `POST /api/auth/login`. Send as `Authorization: Bearer <token>`.',
    },
    customerJWT: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'B2C customer JWT from `POST /api/customer/auth/login`. Send as `Authorization: Bearer <token>`.',
    },
    mobileJWT: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Mobile app JWT from `POST /api/mobile/auth/verify-otp`. Send as `Authorization: Bearer <token>`.',
    },
    apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'Shared desktop-client API key, sent in the `x-api-key` header.',
    },
};
