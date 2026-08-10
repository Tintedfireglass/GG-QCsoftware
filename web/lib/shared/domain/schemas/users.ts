import { z } from 'zod';

/** GET /api/users query parameters. Numeric params clamp (never reject) to
 *  match the original lenient parseInt behavior — no upper cap on limit. */
export const listUsersQuerySchema = z.object({
    page: z.coerce.number().int().catch(1).transform((n) => Math.max(n, 1)),
    limit: z.coerce.number().int().catch(20).transform((n) => Math.max(n, 1)),
    search: z.string().optional(),
    role: z.string().optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/** PUT /api/users/[id] body. Values are business-validated in the service. */
export const updateUserSchema = z.object({
    email: z.string().optional(),
    display_name: z.string().nullish(),
    role: z.string().optional(),
    is_active: z.boolean().optional(),
    password: z.string().optional(),
    license_credits: z.number().nullish(),
    allow_monthly_keys: z.boolean().optional(),
    allow_quarterly_keys: z.boolean().optional(),
    allow_6month_keys: z.boolean().optional(),
    allow_yearly_keys: z.boolean().optional(),
    allow_perpetual_keys: z.boolean().optional(),
    allow_windows_keys: z.boolean().optional(),
    allow_android_keys: z.boolean().optional(),
    allow_ios_keys: z.boolean().optional(),
    allow_mac_keys: z.boolean().optional(),
    allow_qr_label_download: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
