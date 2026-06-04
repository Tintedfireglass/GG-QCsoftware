import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/http/handler';
import { exportSampleDataset } from '@/lib/services/qc-export.service';

/**
 * GET /api/qc-results/export/sample
 *
 * Query params:
 *   format    = "zip" (default) | "xlsx"
 *   goodCount = number of A+/A/B reports to include (default 90)
 *   poorCount = number of C/D reports to include (default 10)
 *   timeZone  = IANA timezone string (default "Asia/Kolkata")
 *
 * Excluded: records with tampered or inconclusive storage / battery.
 */
export const GET = withAuth(null, async (request, { user }) => {
    const { searchParams } = new URL(request.url);

    const format = (searchParams.get('format') || 'zip').toLowerCase() as 'zip' | 'xlsx';
    const goodCount = Math.min(500, Math.max(0, parseInt(searchParams.get('goodCount') || '90', 10)));
    const poorCount = Math.min(500, Math.max(0, parseInt(searchParams.get('poorCount') || '10', 10)));
    const timeZone  = searchParams.get('timeZone') || 'Asia/Kolkata';

    const result = await exportSampleDataset(user, { format, goodCount, poorCount, timeZone });

    return new NextResponse(result.body, {
        status: 200,
        headers: {
            'Content-Type': result.contentType,
            'Content-Disposition': `attachment; filename="${result.filename}"`,
        },
    });
});
