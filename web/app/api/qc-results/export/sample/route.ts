import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/http/handler';
import { exportSampleDataset } from '@/lib/platforms/windows/services/qc-export.service';
import { APP_TIME_ZONE } from '@/lib/timezone';

/**
 * GET /api/qc-results/export/sample
 *
 * Query params:
 *   format    = "zip" (default) | "xlsx"
 *   goodCount = number of A+/A/B reports to include (default 90)
 *   poorCount = number of C/D reports to include (default 10)
 *   timeZone  = IANA timezone string (default: APP_TIME_ZONE, i.e. NEXT_PUBLIC_APP_TIMEZONE)
 *
 * Excluded: records with tampered or inconclusive storage / battery.
 */

// Extend Vercel function timeout to 60s (Pro plan) to handle 100-PDF generation
export const maxDuration = 60;

export const GET = withAuth(null, async (request, { user }) => {
    const { searchParams } = new URL(request.url);

    const format = (searchParams.get('format') || 'zip').toLowerCase() as 'zip' | 'xlsx';
    const goodCount = Math.min(500, Math.max(0, parseInt(searchParams.get('goodCount') || '90', 10)));
    const poorCount = Math.min(500, Math.max(0, parseInt(searchParams.get('poorCount') || '10', 10)));
    const timeZone  = searchParams.get('timeZone') || APP_TIME_ZONE;

    try {
        const result = await exportSampleDataset(user, { format, goodCount, poorCount, timeZone });

        return new NextResponse(result.body, {
            status: 200,
            headers: {
                'Content-Type': result.contentType,
                'Content-Disposition': `attachment; filename="${result.filename}"`,
            },
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[sample-export] error:', message, err);
        return NextResponse.json({ error: 'Export failed', detail: message }, { status: 500 });
    }
});
