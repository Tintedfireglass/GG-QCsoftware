import { z } from 'zod';

/**
 * Query for the admin-facing mobile-reports list. Uses the PC dashboard
 * limit/offset convention (mirrors qc-results), not the mobile page/limit one.
 */
export const adminMobileListQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    /** Matches report_type OR test_type (e.g. BATTERY, FULL_QC, WIFI). */
    type: z.string().trim().min(1).optional(),
    deviceId: z.string().trim().min(1).optional(),
    /** Free-text over report id, device id, customer name/phone/email. */
    search: z.string().trim().min(1).optional(),
    /** Inclusive date range over mr.tested_at ("YYYY-MM-DD"); either bound optional. */
    startDate: z.string().trim().min(1).optional(),
    endDate: z.string().trim().min(1).optional(),
    includeTotal: z.enum(['0', '1']).default('1'),
});

export type AdminMobileListQuery = z.infer<typeof adminMobileListQuerySchema>;
