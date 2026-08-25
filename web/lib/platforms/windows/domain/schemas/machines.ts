import { z } from 'zod';

/** GET /api/machines query parameters. */
export const machinesListQuerySchema = z.object({
    // Fast path for dashboard cards: return only the visible-machine count.
    countOnly: z
        .string()
        .optional()
        .transform((v) => v === '1' || v === 'true'),
    // Archive view: return only machines the operator has archived by hand.
    // Absent / anything but 'true' means the default (non-archived) list.
    archived: z
        .string()
        .optional()
        .transform((v) => v === 'true'),
});

export type MachinesListQuery = z.infer<typeof machinesListQuerySchema>;

/** PATCH /api/partner/v1/machines/[id] body. */
export const renameMachineSchema = z.object({
    customName: z.string().optional(),
});

/** PATCH /api/machines/[id] body. Both fields are optional and independent:
 *  an absent key leaves that side of the machine alone, so archiving never
 *  clears a custom name and vice versa. */
export const updateMachineSchema = z.object({
    customName: z.string().optional(),
    // true = move to the Archive view, false = restore to the active list.
    archived: z.boolean().optional(),
});

export type UpdateMachinePatch = z.infer<typeof updateMachineSchema>;
