import { z } from 'zod';

/** Customer login/register body — coerced with String() in the service. */
export const customerCredentialsSchema = z.object({
    email: z.unknown().optional(),
    password: z.unknown().optional(),
    fullName: z.unknown().optional(),
}).loose();

export type CustomerCredentialsInput = z.infer<typeof customerCredentialsSchema>;
