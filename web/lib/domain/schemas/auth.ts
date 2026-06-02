import { z } from 'zod';

export const loginSchema = z.object({
    identifier: z.string().optional(),
    password: z.string().optional(),
}).loose();
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
    username: z.string().optional(),
    password: z.string().optional(),
    email: z.string().optional(),
    company_name: z.string().nullish(),
    display_name: z.string().nullish(),
    role: z.string().optional(),
}).loose();
export type RegisterInput = z.infer<typeof registerSchema>;

export const licenseActivateSchema = z.object({
    licenseKey: z.string().optional(),
    machineSerial: z.union([z.string(), z.number()]).optional(),
    macAddress: z.string().optional(),
    computerName: z.string().optional(),
}).loose();
export type LicenseActivateInput = z.infer<typeof licenseActivateSchema>;

export const trialSchema = z.object({
    email: z.string().optional(),
    machineSerial: z.union([z.string(), z.number()]).optional(),
    macAddress: z.string().optional(),
    computerName: z.string().optional(),
}).loose();
export type TrialInput = z.infer<typeof trialSchema>;
