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

        // Fetch machine details
        const machines = await query('SELECT * FROM machines WHERE id = $1', [id]);

        if (machines.length === 0) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Machine not found' } as ApiError,
                { status: 404 }
            );
        }

        const machine = machines[0];

        // Fetch test history for this machine
        const testHistory = await query(
            `SELECT 
        id, report_id, timestamp, refurbish_id, overall_pass, 
        system_serial, cpu_model, ram_total
      FROM qc_results
      WHERE machine_id = $1
      ORDER BY timestamp DESC`,
            [id]
        );

        return NextResponse.json({
            machine,
            test_history: testHistory,
        });
    } catch (error) {
        console.error('Error fetching machine details:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'Failed to fetch machine details' } as ApiError,
            { status: 500 }
        );
    }
}
