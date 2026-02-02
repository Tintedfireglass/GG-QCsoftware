import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { extractToken, verifyToken } from '@/lib/auth';
import { ApiError } from '@/lib/types';

export async function GET(request: NextRequest) {
    try {
        // Verify JWT token
        const authHeader = request.headers.get('authorization');
        const token = extractToken(authHeader);

        if (!token || !verifyToken(token)) {
            return NextResponse.json(
                { error: 'Authentication Error', message: 'Invalid or missing token' } as ApiError,
                { status: 401 }
            );
        }

        // Get all machines with test count
        const machines = await query(`
      SELECT 
        m.*,
        COUNT(qr.id) as test_count,
        MAX(qr.timestamp) as last_test_date,
        SUM(CASE WHEN qr.overall_pass = true THEN 1 ELSE 0 END) as passed_count,
        SUM(CASE WHEN qr.overall_pass = false THEN 1 ELSE 0 END) as failed_count
      FROM machines m
      LEFT JOIN qc_results qr ON m.id = qr.machine_id
      GROUP BY m.id
      ORDER BY m.last_seen DESC NULLS LAST
    `);

        return NextResponse.json({ machines });
    } catch (error) {
        console.error('Error fetching machines:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'Failed to fetch machines' } as ApiError,
            { status: 500 }
        );
    }
}
