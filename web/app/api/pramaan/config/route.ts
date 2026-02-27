import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/pramaan/config - Returns the active PRAMAAN scoring configuration
export async function GET() {
    try {
        const results = await query(
            `SELECT version_id, weights, grade_bands, risk_thresholds, is_active 
             FROM pramaan_scoring_versions 
             WHERE is_active = true 
             LIMIT 1`
        );

        if (results.length === 0) {
            // Fallback to defaults if DB is empty or not yet migrated
            return NextResponse.json({
                version: "1.0.0-fallback",
                weights: {
                    storage: 0.25,
                    thermal: 0.20,
                    battery: 0.20,
                    cpu_ram: 0.15,
                    physical_ports: 0.10,
                    repair_modifier: 0.10
                },
                gradeBands: [
                    { grade: "A+", minScore: 90 },
                    { grade: "A", minScore: 80 },
                    { grade: "B", minScore: 65 },
                    { grade: "C", minScore: 50 },
                    { grade: "Reject", minScore: 0 }
                ],
                riskThresholds: {
                    storage: 40,
                    thermal: 40,
                    battery: 35,
                    cpu_ram: 30,
                    physical_ports: 50,
                    repair_modifier: 50
                },
                defaultRepairModifierScore: 100,
                certificationValidityDays: 180
            });
        }

        const activeConfig = results[0] as any;

        return NextResponse.json({
            version: activeConfig.version_id,
            weights: activeConfig.weights,
            gradeBands: activeConfig.grade_bands,
            riskThresholds: activeConfig.risk_thresholds,
            defaultRepairModifierScore: 100, // Still hardcoded defaults for non-DB values
            certificationValidityDays: 180
        });

    } catch (error) {
        console.error('Error fetching PRAMAAN config:', error);
        return NextResponse.json(
            { error: 'Server error fetching scoring configuration' },
            { status: 500 }
        );
    }
}
