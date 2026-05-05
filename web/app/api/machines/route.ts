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

        const { searchParams } = new URL(request.url);
        const countOnly = searchParams.get('countOnly') === '1' || searchParams.get('countOnly') === 'true';

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
        } else if (authUser.role === 'Enterprise' || authUser.role === 'OEM' || authUser.role === 'Insurer' || authUser.role === 'Reseller') {
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

        if (countOnly) {
            // Fast path for dashboard cards: just count visible machines (avoid large payload and per-row subqueries).
            // Note: the full listing query uses GROUP BY/HAVING; for count we use EXISTS-based visibility checks.
            if (authUser.role === 'Technician' || authUser.role === 'Client' || authUser.role === 'B2CDevice') {
                const countRows = await query<{ total: string }>(
                    `SELECT COUNT(*) as total
           FROM machines m
           WHERE EXISTS (
             SELECT 1 FROM qc_results qr
             WHERE qr.machine_id = m.id
               AND qr.technician_id = $1
           )`,
                    [authUser.id]
                );
                return NextResponse.json({ total: parseInt(countRows[0]?.total ?? '0', 10) });
            }

            if (authUser.role === 'Refurbisher') {
                const countRows = await query<{ total: string }>(
                    `SELECT COUNT(*) as total
           FROM machines m
           WHERE EXISTS (
             SELECT 1 FROM qc_results qr
             WHERE qr.machine_id = m.id
               AND (
                 qr.technician_id = $1
                 OR qr.technician_id IN (SELECT id FROM users WHERE created_by = $1)
               )
           )`,
                    [authUser.id]
                );
                return NextResponse.json({ total: parseInt(countRows[0]?.total ?? '0', 10) });
            }

            if (authUser.role === 'Enterprise' || authUser.role === 'OEM' || authUser.role === 'Insurer' || authUser.role === 'Reseller') {
                const countRows = await query<{ total: string }>(
                    `SELECT COUNT(*) as total
           FROM machines m
           WHERE (
             m.owner_user_id = $1 OR EXISTS (
               SELECT 1 FROM qc_results qr2
               WHERE qr2.machine_id = m.id
                 AND (
                   qr2.technician_id = $1
                   OR qr2.technician_id IN (SELECT id FROM users WHERE created_by = $1)
                 )
             )
           )`,
                    [authUser.id]
                );
                return NextResponse.json({ total: parseInt(countRows[0]?.total ?? '0', 10) });
            }

            const countRows = await query<{ total: string }>(
                `SELECT COUNT(*) as total FROM machines`,
                []
            );
            return NextResponse.json({ total: parseInt(countRows[0]?.total ?? '0', 10) });
        }

        // Performance notes:
        // - Avoid correlated subqueries per machine for latest fields.
        // - Aggregate once and join.
        // - Keep role semantics consistent with the previous implementation.
        const fullParams: SqlParam[] = [];
        let visibilityWhere = "1=1";
        let aggWhere = "";
        if (authUser.role === 'Technician' || authUser.role === 'Client' || authUser.role === 'B2CDevice') {
            visibilityWhere = `EXISTS (
                SELECT 1 FROM qc_results qrs
                WHERE qrs.machine_id = m.id AND qrs.technician_id = $1
            )`;
            aggWhere = `WHERE qr.technician_id = $1`;
            fullParams.push(authUser.id);
        } else if (authUser.role === 'Refurbisher') {
            visibilityWhere = `EXISTS (
                SELECT 1 FROM qc_results qrs
                WHERE qrs.machine_id = m.id
                  AND (qrs.technician_id = $1 OR qrs.technician_id IN (SELECT id FROM users WHERE created_by = $1))
            )`;
            aggWhere = `WHERE (qr.technician_id = $1 OR qr.technician_id IN (SELECT id FROM users WHERE created_by = $1))`;
            fullParams.push(authUser.id);
        } else if (authUser.role === 'Enterprise' || authUser.role === 'OEM' || authUser.role === 'Insurer' || authUser.role === 'Reseller') {
            // Keep the existing Enterprise/Reseller visibility logic (owner OR team-tested).
            visibilityWhere = `(
                m.owner_user_id = $1 OR EXISTS (
                    SELECT 1 FROM qc_results qr2
                    WHERE qr2.machine_id = m.id
                      AND (qr2.technician_id = $1 OR qr2.technician_id IN (SELECT id FROM users WHERE created_by = $1))
                )
            )`;
            fullParams.push(authUser.id);
        }

        const machines = await query(
            `WITH agg AS (
                 SELECT
                   qr.machine_id,
                   COUNT(*)::int as test_count,
                   MAX(qr.timestamp) as last_test_date,
                   SUM(CASE WHEN qr.overall_pass = true THEN 1 ELSE 0 END)::int as passed_count,
                   SUM(CASE WHEN qr.overall_pass = false THEN 1 ELSE 0 END)::int as failed_count
                 FROM qc_results qr
                 ${aggWhere}
                 GROUP BY qr.machine_id
             ),
             latest_any AS (
                 SELECT DISTINCT ON (qr.machine_id)
                   qr.machine_id,
                   qr.submission_ip as latest_ip,
                   COALESCE(qr.pramaan_grade, qr.overall_grade) as latest_grade
                 FROM qc_results qr
                 ORDER BY qr.machine_id, qr.timestamp DESC, qr.id DESC
             )
             SELECT
               m.id,
               m.machine_id,
               m.serial_number,
               m.mac_address,
               m.manufacturer,
               m.model,
               m.computer_name,
               m.custom_name,
               m.last_seen,
               m.location,
               m.created_at,
               COALESCE(agg.test_count, 0) as test_count,
               agg.last_test_date,
               COALESCE(agg.passed_count, 0) as passed_count,
               COALESCE(agg.failed_count, 0) as failed_count,
               latest_any.latest_ip,
               latest_any.latest_grade
             FROM machines m
             LEFT JOIN agg ON agg.machine_id = m.id
             LEFT JOIN latest_any ON latest_any.machine_id = m.id
             WHERE ${visibilityWhere}
             ORDER BY m.last_seen DESC NULLS LAST`,
            fullParams
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
