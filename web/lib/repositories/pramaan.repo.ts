import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';

const { pramaanScoringVersions } = schema;

export interface ScoringConfigRow {
    version_id: string;
    weights: unknown;
    grade_bands: unknown;
    risk_thresholds: unknown;
}

/** The active PRAMAAN scoring configuration, or null if none. */
export async function getActiveScoringConfig(): Promise<ScoringConfigRow | null> {
    const rows = await db.select({
        version_id: pramaanScoringVersions.versionId,
        weights: pramaanScoringVersions.weights,
        grade_bands: pramaanScoringVersions.gradeBands,
        risk_thresholds: pramaanScoringVersions.riskThresholds,
    }).from(pramaanScoringVersions).where(eq(pramaanScoringVersions.isActive, true)).limit(1);
    return rows[0] ?? null;
}
