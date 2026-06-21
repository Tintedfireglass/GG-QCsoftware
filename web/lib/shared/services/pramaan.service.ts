import * as repo from '@/lib/shared/repositories/pramaan.repo';

/** Defaults used when no active scoring config row exists. */
const FALLBACK_CONFIG = {
    version: '1.0.3-fallback',
    weights: { storage: 0.25, thermal: 0.20, battery: 0.25, cpu_ram: 0.15, physical_ports: 0.05, repair_modifier: 0.10 },
    gradeBands: [
        { grade: 'A+', minScore: 90 },
        { grade: 'A', minScore: 80 },
        { grade: 'B', minScore: 65 },
        { grade: 'C', minScore: 50 },
        { grade: 'Reject', minScore: 0 },
    ],
    riskThresholds: { storage: 40, thermal: 40, battery: 35, cpu_ram: 30, physical_ports: 50, repair_modifier: 50 },
    defaultRepairModifierScore: 100,
    certificationValidityDays: 180,
};

export async function getScoringConfig() {
    const cfg = await repo.getActiveScoringConfig();
    if (!cfg) return FALLBACK_CONFIG;
    return {
        version: cfg.version_id,
        weights: cfg.weights,
        gradeBands: cfg.grade_bands,
        riskThresholds: cfg.risk_thresholds,
        defaultRepairModifierScore: 100,
        certificationValidityDays: 180,
    };
}
