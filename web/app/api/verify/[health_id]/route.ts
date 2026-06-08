import { NextRequest, NextResponse } from 'next/server';
import { findCertByHealthId } from '@/lib/platforms/windows/repositories/qc-results.repo';

// GET /api/verify/{health_id} — Public verification endpoint.
// Returns ONLY a structured verification summary. No raw data exposed.
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ health_id: string }> }
) {
    try {
        const { health_id } = await params;
        if (!health_id) {
            return NextResponse.json({ error: 'Missing health_id parameter' }, { status: 400 });
        }

        const result = await findCertByHealthId(health_id);
        if (!result) {
            return NextResponse.json(
                { verified: false, error: 'Certificate not found', message: 'No PRAMAAN certification found for this Health ID' },
                { status: 404 }
            );
        }

        const certDate = new Date(result.timestamp as string);
        const validityDays = 180;
        const validUntil = new Date(certDate);
        validUntil.setDate(validUntil.getDate() + validityDays);
        const isExpired = new Date() > validUntil;

        return NextResponse.json({
            verified: true,
            healthId: result.health_id,
            algorithmHash: result.pramaan_hash,
            reportId: result.report_id,
            score: result.pramaan_score,
            grade: result.pramaan_grade,
            gradeLabel: getGradeLabel(result.pramaan_grade as string | null),
            certificationDate: certDate.toISOString(),
            validUntil: validUntil.toISOString(),
            validityDays,
            status: isExpired ? 'expired' : 'valid',
            algorithmVersion: result.pramaan_algorithm_version,
            appVersion: result.app_version,
            device: {
                manufacturer: result.system_manufacturer || null,
                model: result.system_model || null,
            },
        });
    } catch (error) {
        console.error('Error verifying health ID:', error);
        return NextResponse.json({ verified: false, error: 'Server error during verification' }, { status: 500 });
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
