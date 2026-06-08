import { z } from 'zod';

export const fleetListQuerySchema = z.object({
    group_id: z.coerce.number().int().optional().catch(undefined),
    search: z.string().trim().optional(),
});

export const fleetEnrollSchema = z.object({
    machine_id: z.string().optional(),
    asset_tag: z.string().nullish(),
    group_id: z.coerce.number().int().nullish(),
    serial_number: z.string().nullish(),
    manufacturer: z.string().nullish(),
    model: z.string().nullish(),
}).loose();

export type FleetEnrollInput = z.infer<typeof fleetEnrollSchema>;

export const lifecycleEventSchema = z.object({
    event_type: z.string().optional(),
    notes: z.string().nullish(),
}).loose();

export type LifecycleEventInput = z.infer<typeof lifecycleEventSchema>;
