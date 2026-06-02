import { z } from 'zod';

/** POST /api/licenses body. Values are business-validated in the service so
 *  the original error messages are preserved; the schema just fixes shape. */
export const generateLicenseSchema = z.object({
    type: z.string().optional(),
    max_uses: z.number().int().nullish(),
    expires_at: z.string().nullish(),
    demo_customer_name: z.string().nullish(),
});

export type GenerateLicenseInput = z.infer<typeof generateLicenseSchema>;

/** PATCH /api/licenses body. */
export const toggleLicenseSchema = z.object({
    id: z.coerce.number().int(),
    is_active: z.boolean(),
});

export type ToggleLicenseInput = z.infer<typeof toggleLicenseSchema>;
