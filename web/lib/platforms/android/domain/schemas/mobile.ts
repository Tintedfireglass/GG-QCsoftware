import { z } from 'zod';

// Report bodies are stored verbatim in payload_json, so object schemas use
// `.loose()` (passthrough) — validate the fields we index on, keep the rest.

export const RESULT_VALUES = ['PASSED', 'FAILED', 'PARTIAL_PASS', 'SKIPPED'] as const;
export const SINGLE_TEST_TYPES = [
    'VIBRATION', 'VOLUME', 'POWER_BUTTON', 'SPEAKER', 'MICROPHONE', 'CAMERA',
    'BLUETOOTH', 'WIFI', 'GPS', 'NFC', 'INFRARED', 'FINGERPRINT', 'CHARGING_PORT', 'HEADPHONE_JACK',
    'LIVE_CALL',
] as const;

const phone = z.string().trim().min(6, 'A valid phone number is required').max(20);

// ── Auth (phone + OTP) ──────────────────────────────────────────────────────────
export const requestOtpSchema = z.object({
    phone,
    countryCode: z.string().trim().max(6).optional(),
});

export const verifyOtpSchema = z.object({
    phone,
    otp: z.string().trim().regex(/^\d{4,8}$/, 'OTP must be 4–8 digits'),
    // Optional profile captured on first login (new user).
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    email: z.string().trim().email().optional(),
    dateOfBirth: z.string().trim().optional(), // DD/MM/YYYY
    countryCode: z.string().trim().max(6).optional(),
});

// ── Profile ─────────────────────────────────────────────────────────────────────
export const updateProfileSchema = z
    .object({
        firstName: z.string().trim().max(100).optional(),
        lastName: z.string().trim().max(100).optional(),
        phone: phone.optional(),
        email: z.string().trim().email().optional(),
        dateOfBirth: z.string().trim().optional(),
        countryCode: z.string().trim().max(6).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, 'No fields to update');

export const deleteAccountSchema = z.object({
    confirmDelete: z.literal(true, { message: 'confirmDelete must be true' }),
});

// ── Device info ───────────────────────────────────────────────────────────────
export const deviceInfoSchema = z
    .object({
        deviceId: z.string().trim().min(1, 'deviceId is required'),
        model: z.string().trim().min(1, 'model is required'),
        manufacturer: z.string().trim().min(1, 'manufacturer is required'),
        brand: z.string().trim().optional(),
        os: z.string().trim().optional(),
        androidVersion: z.string().trim().optional(),
        apiLevel: z.coerce.number().int().optional(),
        processor: z.string().trim().optional(),
        serialNumber: z.string().trim().optional(),
        ram: z.string().trim().optional(),
        storage: z.string().trim().optional(),
    })
    .loose();

// ── Reports ─────────────────────────────────────────────────────────────────────
const reportBase = {
    deviceId: z.string().trim().min(1, 'deviceId is required'),
    testedAt: z.string().trim().min(1, 'testedAt is required'),
};

export const batteryReportSchema = z
    .object({ ...reportBase, result: z.enum(['PASSED', 'FAILED']) })
    .loose();

export const displayReportSchema = z
    .object({ ...reportBase, overallResult: z.enum(['PASSED', 'FAILED']) })
    .loose();

export const sensorsReportSchema = z
    .object({
        ...reportBase,
        overallResult: z.enum(['PASSED', 'FAILED']),
        sensors: z.array(z.object({}).loose()).optional(),
    })
    .loose();

export const singleTestSchema = z
    .object({
        ...reportBase,
        testType: z.enum(SINGLE_TEST_TYPES),
        result: z.enum(['PASSED', 'FAILED']),
        notes: z.string().optional(),
    })
    .loose();

export const fullQcSchema = z
    .object({
        ...reportBase,
        totalTests: z.coerce.number().int(),
        passedCount: z.coerce.number().int(),
        failedCount: z.coerce.number().int(),
        overallResult: z.enum(['PASSED', 'PARTIAL_PASS', 'FAILED']),
        testResults: z.record(z.string(), z.boolean()),
        // Present only for Full Health runs (hardware QC + stress folded into one report).
        stress: z
            .object({
                score: z.coerce.number().int(),
                grade: z.string(),
                passed: z.boolean(),
            })
            .loose()
            .optional(),
        deviceSnapshot: z.object({}).loose().optional(),
    })
    .loose();

export const stressReportSchema = z
    .object({
        ...reportBase,
        durationSeconds: z.coerce.number().int(),
        abortedByHeat: z.boolean(),
        oomOccurred: z.boolean(),
        result: z.object({
            score: z.coerce.number().int(),
            grade: z.string(),
            passed: z.boolean(),
        }).loose(),
        phases: z.array(z.object({}).loose()),
        perfGraph: z
            .array(z.object({
                elapsedSec: z.coerce.number().int(),
                gips: z.coerce.number().optional(),
                phase: z.string().optional(),
            }).loose())
            .optional(),
        deviceSnapshot: z.object({}).loose().optional(),
    })
    .loose();

// ── History ─────────────────────────────────────────────────────────────────────
// GET query: clamp rather than reject (see layered-architecture zod gotcha).
export const historyQuerySchema = z.object({
    page: z.coerce.number().int().catch(1).transform((n) => Math.max(1, n)),
    limit: z.coerce.number().int().catch(20).transform((n) => Math.min(100, Math.max(1, n))),
    type: z.string().trim().optional(),
    deviceId: z.string().trim().optional(),
});

// ── Support (Contact Support) ────────────────────────────────────────────────────
export const supportContactSchema = z.object({
    subject: z.string().trim().min(3, 'Subject is required').max(160),
    message: z.string().trim().min(5, 'Message is required').max(4000),
    category: z.string().trim().max(80).optional(),
    deviceId: z.string().trim().max(120).optional(),
    appVersion: z.string().trim().max(40).optional(),
});

export const supportListQuerySchema = z.object({
    page: z.coerce.number().int().catch(1).transform((n) => Math.max(1, n)),
    limit: z.coerce.number().int().catch(20).transform((n) => Math.min(100, Math.max(1, n))),
});

// Customer message in a ticket conversation.
export const supportMessageSchema = z.object({
    message: z.string().trim().min(1, 'Message is required').max(4000),
});

// ── License (key activation) ─────────────────────────────────────────────────────
export const licenseActivateSchema = z.object({
    key: z.string().trim().min(1, 'key is required'),
    deviceId: z.string().trim().min(1, 'deviceId is required'),
});

export const licenseStatusQuerySchema = z.object({
    deviceId: z.string().trim().optional(),
});
