import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';

const { scoringVersions } = schema;

export interface ScoringConfigRow {
    version_id: string;
    weights: unknown;
    grade_bands: unknown;
    risk_thresholds: unknown;
}

/** The active PRAMAAN scoring configuration, or null if none. */
export async function getActiveScoringConfig(): Promise<ScoringConfigRow | null> {
    const rows = await db.select({
        version_id: scoringVersions.versionId,
        weights: scoringVersions.weights,
        grade_bands: scoringVersions.gradeBands,
        risk_thresholds: scoringVersions.riskThresholds,
    }).from(scoringVersions).where(eq(scoringVersions.isActive, true)).limit(1);
    return rows[0] ?? null;
}
