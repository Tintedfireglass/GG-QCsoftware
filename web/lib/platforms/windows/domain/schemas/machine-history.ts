import { z } from 'zod';

/** POST /api/machine-history body (values business-validated in the service). */
export const submitMachineHistorySchema = z.object({
    machineId: z.string().optional(),
    timestamp: z.string().optional(),
    source: z.string().optional(),
    componentGrades: z.record(z.string(), z.any()).optional(),
    appVersion: z.string().optional(),
}).loose();

export type SubmitMachineHistoryInput = z.infer<typeof submitMachineHistorySchema>;

/** GET /api/machine-history/alerts query (raw strings; clamped in the service). */
export const alertsQuerySchema = z.object({
    recentDays: z.string().optional(),
    limit: z.string().optional(),
});

export type AlertsQuery = z.infer<typeof alertsQuerySchema>;
