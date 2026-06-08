import { z } from 'zod';

// Public store-website checkout (no prior login). Field names mirror the
// store form inputs.
export const publicCheckoutSchema = z.object({
    planId: z.number().int().positive(),
    name: z.string().trim().min(1, 'Name is required').max(120),
    company_name: z.string().trim().max(160).nullish(),
    email_id: z.string().trim().email('A valid email is required').max(160),
    phone_no: z.string().trim().max(20).nullish(),
    autoRenew: z.boolean().optional(),
    couponCode: z.string().trim().max(40).nullish(),
    quantity: z.number().int().min(1).max(999).optional(),
});
export type PublicCheckoutInput = z.infer<typeof publicCheckoutSchema>;
