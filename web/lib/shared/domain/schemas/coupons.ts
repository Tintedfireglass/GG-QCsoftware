import { z } from 'zod';

/** POST /api/admin/coupons body. Cross-field rules (percent range, fixed needs
 *  currency, etc.) are validated in the service. */
export const createCouponSchema = z.object({
    code: z.string().min(2).max(40),
    description: z.string().nullish(),
    discount_type: z.enum(['percent', 'fixed']),
    discount_value: z.number().int().min(1),
    max_discount_cents: z.number().int().min(0).nullish(),
    currency: z.string().nullish(),
    min_order_cents: z.number().int().min(0).optional(),
    max_redemptions: z.number().int().min(1).nullish(),
    per_customer_limit: z.number().int().min(1).nullish(),
    applicable_plan_ids: z.array(z.number().int()).nullish(),
    valid_from: z.string().datetime().nullish(),
    valid_until: z.string().datetime().nullish(),
    is_active: z.boolean().optional(),
    is_public: z.boolean().optional(),
});
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

/** PATCH /api/admin/coupons/[id] body — all fields optional. */
export const updateCouponSchema = createCouponSchema.partial();
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;

/** POST /api/customer/coupons/validate body — preview a discount before paying. */
export const validateCouponSchema = z.object({
    code: z.string().min(1),
    planId: z.number().int(),
});
export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;
