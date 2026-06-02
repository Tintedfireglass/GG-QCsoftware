import { z } from 'zod';

/** GET /api/machines query parameters. */
export const machinesListQuerySchema = z.object({
    // Fast path for dashboard cards: return only the visible-machine count.
    countOnly: z
        .string()
        .optional()
        .transform((v) => v === '1' || v === 'true'),
});

export type MachinesListQuery = z.infer<typeof machinesListQuerySchema>;

/** PATCH /api/machines/[id] body. */
export const renameMachineSchema = z.object({
    customName: z.string().optional(),
});
