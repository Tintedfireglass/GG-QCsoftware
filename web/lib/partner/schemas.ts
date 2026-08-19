import { z } from 'zod';
import { PARTNER_EVENTS } from './events';
import { PARTNER_SCOPES } from './scopes';

/** GET /api/partner/v1/licenses — mirrors the dashboard's license list params. */
export const licenseListQuerySchema = z.object({
    search: z.string().trim().min(1).optional(),
    status: z.string().trim().min(1).optional(),
    sort: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** POST /api/admin/partner-keys — what an admin submits to mint a key. */
export const issueKeySchema = z.object({
    userId: z.coerce.number().int().positive(),
    name: z.string().trim().min(1).max(80),
    scopes: z.array(z.enum(PARTNER_SCOPES)).default([]),
    rateLimitPerMin: z.coerce.number().int().min(1).max(6000).default(120),
    allowedOrigins: z.array(z.string().trim().min(1)).default([]),
    /** ISO timestamp, or null/absent for a key that never expires. */
    expiresAt: z.string().trim().min(1).nullable().default(null),
});

export type IssueKeyBody = z.infer<typeof issueKeySchema>;

/**
 * GET /api/partner/v1/users — the dashboard schema with an upper bound on
 * `limit`, which it deliberately leaves uncapped for its own paginated table.
 */
export const userListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(20),
    search: z.string().trim().min(1).optional(),
    role: z.string().trim().min(1).optional(),
});

/** PATCH /api/partner/v1/licenses/{id} — toggle active state or move the expiry. */
export const licenseUpdateSchema = z
    .object({
        is_active: z.boolean().optional(),
        expires_at: z.string().nullable().optional(),
    })
    .refine((v) => v.is_active !== undefined || v.expires_at !== undefined, {
        message: 'Provide is_active or expires_at',
    });

/** POST /api/admin/partner-webhooks — register an outbound endpoint. */
export const createWebhookSchema = z.object({
    userId: z.coerce.number().int().positive(),
    name: z.string().trim().min(1).max(80),
    url: z.string().trim().url(),
    events: z.array(z.enum(PARTNER_EVENTS)).min(1),
});

/** PATCH /api/admin/partner-webhooks/{id} — pause or re-enable. */
export const toggleWebhookSchema = z.object({ isActive: z.boolean() });
