import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { extractToken, verifyToken } from '@/lib/auth';
import { ApiError } from '@/lib/types';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Verify JWT token
        const authHeader = request.headers.get('authorization');
        const token = extractToken(authHeader);

        if (!token || !verifyToken(token)) {
            return NextResponse.json(
                { error: 'Authentication Error', message: 'Invalid or missing token' } as ApiError,
                { status: 401 }
            );
        }

        // Fetch QC result with machine info
        const results = await query(
            `SELECT 
        qr.*,
        m.machine_id as machine_identifier,
        m.location as machine_location,
        m.manufacturer as machine_manufacturer,
        m.model as machine_model
      FROM qc_results qr
      LEFT JOIN machines m ON qr.machine_id = m.id
      WHERE qr.id = $1`,
            [id]
        );

        if (results.length === 0) {
            return NextResponse.json(
                { error: 'Not Found', message: 'QC result not found' } as ApiError,
                { status: 404 }
            );
        }

        const qcResult = results[0];

        // Fetch test results
        const testResults = await query(
            'SELECT * FROM test_results WHERE qc_result_id = $1 ORDER BY test_type',
            [id]
        );

        return NextResponse.json({
            ...qcResult,
            test_results: testResults,
        });
    } catch (error) {
        console.error('Error fetching QC result:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'Failed to fetch QC result' } as ApiError,
            { status: 500 }
        );
    }
}
