import { z } from 'zod';

/** Customer login/register body — coerced with String() in the service. */
export const customerCredentialsSchema = z.object({
    email: z.unknown().optional(),
    password: z.unknown().optional(),
    fullName: z.unknown().optional(),
}).loose();

export type CustomerCredentialsInput = z.infer<typeof customerCredentialsSchema>;

// Admin edit of a customer account. All fields optional (partial update);
// is_active doubles as the activate/deactivate toggle. An explicitly null/empty
// value clears the field; omitted fields are left unchanged.
export const updateCustomerSchema = z.object({
    full_name: z.string().trim().max(160).nullish(),
    company: z.string().trim().max(160).nullish(),
    phone: z.string().trim().max(20).nullish(),
    email: z.string().trim().email('A valid email is required').max(160).nullish(),
    is_active: z.boolean().optional(),
}).refine(
    (v) => Object.keys(v).length > 0,
    { message: 'No fields to update' },
);
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
