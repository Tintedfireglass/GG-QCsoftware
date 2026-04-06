import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';
import { ApiError } from '@/lib/types';

type SqlParam = string | number | boolean | null;

export async function GET(request: NextRequest) {
    try {
        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError) return authError;
        if (!authUser) {
            return NextResponse.json(
                { error: 'Authentication Error', message: 'Not authenticated' } as ApiError,
                { status: 401 }
            );
        }

        const params: SqlParam[] = [];
        let joinCondition = 'm.id = qr.machine_id';
        let whereClause = '';
        let havingClause = '';

        if (authUser.role === 'Technician' || authUser.role === 'Client' || authUser.role === 'B2CDevice') {
            joinCondition += ' AND qr.technician_id = $1';
            params.push(authUser.id);
            havingClause = 'HAVING COUNT(qr.id) > 0';
        } else if (authUser.role === 'Refurbisher') {
            joinCondition += ' AND (qr.technician_id = $1 OR qr.technician_id IN (SELECT id FROM users WHERE created_by = $1))';
            params.push(authUser.id);
            havingClause = 'HAVING COUNT(qr.id) > 0';
        } else if (authUser.role === 'Enterprise' || authUser.role === 'Reseller') {
            // Enterprise sees machines they own or that their team tested
            whereClause = `WHERE (
                m.owner_user_id = $1 OR EXISTS (
                    SELECT 1 FROM qc_results qr2
                    WHERE qr2.machine_id = m.id
                      AND (qr2.technician_id = $1 OR qr2.technician_id IN (SELECT id FROM users WHERE created_by = $1))
                )
            )`;
            params.push(authUser.id);
        }

        const machines = await query(
            `SELECT
        m.*,
        COUNT(qr.id) as test_count,
        MAX(qr.timestamp) as last_test_date,
        SUM(CASE WHEN qr.overall_pass = true THEN 1 ELSE 0 END) as passed_count,
        SUM(CASE WHEN qr.overall_pass = false THEN 1 ELSE 0 END) as failed_count,
        (SELECT qr2.submission_ip FROM qc_results qr2 WHERE qr2.machine_id = m.id ORDER BY qr2.timestamp DESC LIMIT 1) as latest_ip
      FROM machines m
      LEFT JOIN qc_results qr ON ${joinCondition}
      ${whereClause}
      GROUP BY m.id
      ${havingClause}
      ORDER BY m.last_seen DESC NULLS LAST`,
            params
        );

        return NextResponse.json({ machines });
    } catch (error) {
        console.error('Error fetching machines:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'Failed to fetch machines' } as ApiError,
            { status: 500 }
        );
    }
}
