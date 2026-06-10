import { z } from 'zod';

export const VALID_TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export const VALID_TICKET_PRIORITIES = ['low', 'normal', 'high'] as const;

// Admin triage update — every field optional, but at least one must be present.
export const updateTicketSchema = z
    .object({
        status: z.enum(VALID_TICKET_STATUSES).optional(),
        priority: z.enum(VALID_TICKET_PRIORITIES).optional(),
        adminNote: z.string().trim().max(2000).nullish(),
    })
    .refine((v) => Object.keys(v).length > 0, 'No fields to update');
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
