import { z } from 'zod';

// Public contact form. Field names mirror the store-website form inputs
// (name, company_name, phone_no, email_id, service, description).
export const contactSubmitSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    company_name: z.string().trim().max(160).nullish(),
    phone_no: z.string().trim().max(20).nullish(),
    email_id: z.string().trim().email('A valid email is required').max(160),
    service: z.string().trim().max(80).nullish(),
    description: z.string().trim().max(250).nullish(),
});
export type ContactSubmitInput = z.infer<typeof contactSubmitSchema>;

export const VALID_CONTACT_STATUSES = ['new', 'read', 'archived'] as const;

export const updateContactSchema = z.object({
    status: z.enum(VALID_CONTACT_STATUSES),
});
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
