import { NextRequest, NextResponse } from 'next/server';
import { findCertByHealthId } from '@/lib/platforms/windows/repositories/qc-results.repo';
import { findReportForVerify } from '@/lib/platforms/android/repositories/mobile-reports.repo';
import { gradeLabel } from '@/lib/platforms/windows/grades';

const VALIDITY_DAYS = 180;

/** Standard {validUntil, status} from an issue date + fixed validity window. */
function validity(certDate: Date) {
    const validUntil = new Date(certDate);
    validUntil.setDate(validUntil.getDate() + VALIDITY_DAYS);
    return { validUntil, isExpired: new Date() > validUntil };
}

// GET /api/verify/{health_id} — Public verification endpoint.
// Returns ONLY a structured verification summary. No raw data exposed.
// Resolves both PC certificates (qc_results.health_id) and mobile QC reports
// (mobile_reports.report_id) so one QR/verify page works for either.
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ health_id: string }> }
) {
    try {
        const { health_id } = await params;
        if (!health_id) {
            return NextResponse.json({ error: 'Missing health_id parameter' }, { status: 400 });
        }

        // qc_results.health_id is a UUID column — a mobile report id (rpt_…) throws
        // an invalid-uuid cast error, so tolerate it and fall through to the mobile lookup.
        let result: Record<string, unknown> | null = null;
        try {
            result = await findCertByHealthId(health_id);
        } catch {
            result = null;
        }
        if (result) {
            const certDate = new Date(result.timestamp as string);
            const { validUntil, isExpired } = validity(certDate);
            return NextResponse.json({
                verified: true,
                healthId: result.health_id,
                algorithmHash: result.health_hash,
                reportId: result.report_id,
                score: result.health_score,
                grade: result.health_grade,
                gradeLabel: getGradeLabel(result.health_grade as string | null),
                certificationDate: certDate.toISOString(),
                validUntil: validUntil.toISOString(),
                validityDays: VALIDITY_DAYS,
                status: isExpired ? 'expired' : 'valid',
                algorithmVersion: result.scoring_algorithm_version,
                appVersion: result.app_version,
                device: {
                    manufacturer: result.system_manufacturer || null,
                    model: result.system_model || null,
                },
            });
        }

        // Fallback: a mobile QC report certificate (same response shape).
        const mobile = await findReportForVerify(health_id);
        if (mobile) {
            const certDate = new Date(mobile.tested_at as string);
            const { validUntil, isExpired } = validity(certDate);
            return NextResponse.json({
                verified: true,
                healthId: mobile.report_id,
                algorithmHash: null,
                reportId: mobile.report_id,
                score: mobile.score,
                grade: mobile.grade,
                gradeLabel: getGradeLabel(mobile.grade as string | null),
                certificationDate: certDate.toISOString(),
                validUntil: validUntil.toISOString(),
                validityDays: VALIDITY_DAYS,
                status: isExpired ? 'expired' : 'valid',
                algorithmVersion: null,
                appVersion: mobile.app_version ?? null,
                device: {
                    manufacturer: (mobile.manufacturer as string) || null,
                    model: (mobile.device_model as string) || null,
                },
            });
        }

        return NextResponse.json(
            { verified: false, error: 'Certificate not found', message: 'No PRAMAAN certification found for this Health ID' },
            { status: 404 }
        );
    } catch (error) {
        console.error('Error verifying health ID:', error);
        return NextResponse.json({ verified: false, error: 'Server error during verification' }, { status: 500 });
    }
}

function getGradeLabel(grade: string | null): string {
    return gradeLabel(grade ?? undefined);
}
