import { z } from 'zod';

/** POST /api/track body — sent by the storefront tracking script. Public & lenient. */
export const trackSchema = z.object({
    visitorId: z.string().min(1).max(64),
    sessionId: z.string().min(1).max(64),
    type: z.enum(['pageview', 'event']),
    name: z.string().max(80).nullish(),
    path: z.string().max(512),
    referrer: z.string().max(1024).nullish(),
    utmSource: z.string().max(120).nullish(),
    utmMedium: z.string().max(120).nullish(),
    utmCampaign: z.string().max(120).nullish(),
    metadata: z.record(z.string(), z.unknown()).nullish(),
});
export type TrackInput = z.infer<typeof trackSchema>;
