import { z } from 'zod';

/** Lenient bool flag: absent stays undefined (so the filter is skipped); when
 *  present, only 'true' is true — matching the originals' `=== 'true'` checks.
 *  Never rejects. */
const boolFlag = z.string().optional().transform((v) => (v === undefined ? undefined : v === 'true'));

/** Grade buckets the UI can filter by (mirrors the client's getGradeKey()). */
export const GRADE_KEYS = ['A+', 'A', 'B', 'C', 'Unknown'] as const;
export type GradeKey = (typeof GRADE_KEYS)[number];

/** Supported server-side sort orders for the results list. */
export const SORT_KEYS = ['grade_desc', 'grade_asc', 'date_desc', 'date_asc', 'id_asc'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** GET /api/qc-results query parameters. Numeric params CLAMP (never reject) to
 *  mirror the original Math.min/Math.max behavior. */
export const listQuerySchema = z.object({
    limit: z.coerce.number().int().catch(50).transform((n) => Math.min(Math.max(n, 1), 200)),
    offset: z.coerce.number().int().catch(0).transform((n) => Math.max(n, 0)),
    machineId: z.string().trim().optional(),
    refurbishId: z.string().trim().optional(),
    userId: z.coerce.number().int().optional(),
    overallPass: boolFlag,
    search: z.string().trim().optional(),
    hasIssues: boolFlag,
    // Comma-separated grade buckets; unknown tokens are dropped (never rejects).
    grades: z
        .string()
        .optional()
        .transform((v) =>
            v
                ? v
                      .split(',')
                      .map((s) => s.trim())
                      .filter((s): s is GradeKey => (GRADE_KEYS as readonly string[]).includes(s))
                : undefined
        ),
    // Sort order; anything unrecognized falls back to newest-first.
    sort: z.enum(SORT_KEYS).catch('date_desc'),
    // includeTotal defaults true; only '0'/'false' disable it.
    includeTotal: z
        .string()
        .optional()
        .transform((v) => v !== '0' && v !== 'false'),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

const testResultSchema = z.object({
    testType: z.string(),
    tested: z.boolean(),
    passed: z.boolean(),
    score: z.number().optional(),
    grade: z.string().optional(),
    message: z.string().optional(),
    details: z.any().optional(),
    timestamp: z.string().optional(),
});

/** POST /api/qc-results body. Deep snapshot blobs are stored as JSON, so they
 *  stay loosely typed; only the identifying/required fields are enforced. */
export const submitSchema = z
    .object({
        reportId: z.string().min(1),
        machineId: z.string().trim().min(1),
        timestamp: z.string().min(1),
        refurbishId: z.string().optional(),
        technicianNotes: z.string().optional(),
        appVersion: z.string().optional(),
        overallPass: z.boolean(),
        overallScore: z.number().optional(),
        overallGrade: z.string().optional(),
        technicianId: z.number().optional(),
        systemInfo: z.record(z.string(), z.any()).optional(),
        testResults: z.array(testResultSchema).default([]),
        cpuDetails: z.any().optional(),
        ramDetails: z.any().optional(),
        storageDetails: z.any().optional(),
        batteryDetails: z.any().optional(),
        deviceDetails: z.any().optional(),
        pramaanScore: z.number().optional(),
        healthId: z.string().optional(),
        pramaanHash: z.string().optional(),
        pramaanGrade: z.string().optional(),
        pramaanCategoryScores: z.any().optional(),
        pramaanRiskFlags: z.any().optional(),
        pramaanAlgorithmVersion: z.string().optional(),
    })
    // Preserve any extra fields the desktop client sends.
    .loose();

export type SubmitInput = z.infer<typeof submitSchema>;
