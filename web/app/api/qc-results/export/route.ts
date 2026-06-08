import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/http/handler';
import { exportQcResults } from '@/lib/platforms/windows/services/qc-export.service';

// GET /api/qc-results/export - export latest-per-machine QC results as XLSX or PDF
export const GET = withAuth(null, async (request, { user }) => {
    const { searchParams } = new URL(request.url);
    const result = await exportQcResults(user, {
        search: searchParams.get('search')?.trim() || undefined,
        userIdParam: searchParams.get('userId'),
        format: (searchParams.get('format') || 'xlsx').toLowerCase(),
        timeZone: searchParams.get('timeZone') || 'Asia/Kolkata',
    });

    return new NextResponse(result.body, {
        status: 200,
        headers: {
            'Content-Type': result.contentType,
            'Content-Disposition': `attachment; filename="${result.filename}"`,
        },
    });
});
