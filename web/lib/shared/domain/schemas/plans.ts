import { z } from 'zod';

export const PLATFORMS = ['windows', 'android', 'ios', 'mac'] as const;

/** POST /api/admin/plans body. Business rules (caps match scope, interval for
 *  recurring, etc.) are validated in the service. */
export const createPlanSchema = z.object({
    name: z.string().min(1),
    description: z.string().nullish(),
    price_cents: z.number().int().min(0),
    currency: z.string().optional(),
    product_scope: z.array(z.enum(PLATFORMS)).min(1),
    platform_caps: z.record(z.string(), z.number().int().min(1)),
    duration_days: z.number().int().min(1).nullish(),
    // Marketing bullet points shown on the storefront card.
    features: z.array(z.string()).nullish(),
    // Offer auto-renewal at checkout (only meaningful for finite-duration plans).
    allow_auto_renew: z.boolean().optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().optional(),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

/** PATCH /api/admin/plans/[id] body — all fields optional. */
export const updatePlanSchema = createPlanSchema.partial();
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
