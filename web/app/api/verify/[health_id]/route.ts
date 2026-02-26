import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/verify/{health_id} — Public verification endpoint
// Returns ONLY structured verification summary. NO raw data exposed.
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ health_id: string }> }
) {
    try {
        const { health_id } = await params;

        if (!health_id) {
            return NextResponse.json(
                { error: 'Missing health_id parameter' },
                { status: 400 }
            );
        }

        // Look up by report_id (which maps to health_id in PRAMAAN)
        const results = await query(
            `SELECT 
                report_id,
                pramaan_score,
                pramaan_grade,
                pramaan_algorithm_version,
                timestamp,
                system_model,
                system_manufacturer
            FROM qc_results 
            WHERE report_id = $1 AND pramaan_score IS NOT NULL`,
            [health_id]
        );

        if (results.length === 0) {
            return NextResponse.json(
                {
                    verified: false,
                    error: 'Certificate not found',
                    message: 'No PRAMAAN certification found for this Health ID',
                },
                { status: 404 }
            );
        }

        const result = results[0] as any;
        const certDate = new Date(result.timestamp);
        const validityDays = 180; // Default; future: from scoring_config
        const validUntil = new Date(certDate);
        validUntil.setDate(validUntil.getDate() + validityDays);

        const isExpired = new Date() > validUntil;

        return NextResponse.json({
            verified: true,
            healthId: result.report_id,
            score: result.pramaan_score,
            grade: result.pramaan_grade,
            gradeLabel: getGradeLabel(result.pramaan_grade),
            certificationDate: certDate.toISOString(),
            validUntil: validUntil.toISOString(),
            validityDays,
            status: isExpired ? 'expired' : 'valid',
            algorithmVersion: result.pramaan_algorithm_version,
            device: {
                manufacturer: result.system_manufacturer || null,
                model: result.system_model || null,
            },
        });
    } catch (error) {
        console.error('Error verifying health ID:', error);
        return NextResponse.json(
            { verified: false, error: 'Server error during verification' },
            { status: 500 }
        );
    }
}

function getGradeLabel(grade: string | null): string {
    switch (grade) {
        case 'A+': return 'Certified Premium';
        case 'A': return 'Certified';
        case 'B': return 'Good Condition';
        case 'C': return 'Acceptable';
        case 'Reject': return 'Not Certified';
        default: return 'Unknown';
    }
}
