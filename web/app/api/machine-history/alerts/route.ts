import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';
import { ApiError } from '@/lib/types';

type SqlParam = string | number | boolean | null;

const gradeRank: Record<string, number> = {
    A: 5,
    B: 4,
    C: 3,
    D: 2,
    E: 1,
    F: 0
};

const componentLabels: Record<string, string> = {
    cpu: 'CPU',
    ram: 'RAM',
    storage: 'Storage',
    battery: 'Battery',
    smart: 'SMART'
};

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
        let whereClause = '';

        if (authUser.role === 'Technician' || authUser.role === 'Client' || authUser.role === 'B2CDevice' || authUser.role === 'Employee') {
            whereClause = 'mh.created_by = $1';
            params.push(authUser.id);
        } else if (authUser.role === 'Refurbisher' || authUser.role === 'Enterprise' || authUser.role === 'Reseller') {
            whereClause = 'mh.created_by = $1 OR mh.created_by IN (SELECT id FROM users WHERE created_by = $1)';
            params.push(authUser.id);
        }

        const whereSql = whereClause ? `WHERE ${whereClause}` : '';

        const rows = await query(
            `
            WITH scoped AS (
                SELECT
                    mh.*,
                    m.machine_id as machine_identifier,
                    m.custom_name as custom_name,
                    ROW_NUMBER() OVER (PARTITION BY mh.machine_id ORDER BY mh.timestamp DESC, mh.id DESC) AS rn
                FROM machine_history mh
                JOIN machines m ON m.id = mh.machine_id
                ${whereSql}
            )
            SELECT * FROM scoped WHERE rn <= 2 ORDER BY machine_id, rn
            `,
            params
        );

        const grouped = new Map<number, { latest?: any; previous?: any }>();
        for (const row of rows) {
            const entry = grouped.get(row.machine_id) || {};
            if (row.rn === 1) entry.latest = row;
            if (row.rn === 2) entry.previous = row;
            grouped.set(row.machine_id, entry);
        }

        const alerts: any[] = [];

        for (const [machineId, entry] of grouped.entries()) {
            const latest = entry.latest;
            const previous = entry.previous;
            if (!latest || !previous) continue;

            const latestGrades = typeof latest.component_grades === 'string'
                ? JSON.parse(latest.component_grades)
                : latest.component_grades || {};
            const previousGrades = typeof previous.component_grades === 'string'
                ? JSON.parse(previous.component_grades)
                : previous.component_grades || {};

            const latestTs = new Date(latest.timestamp);
            const previousTs = new Date(previous.timestamp);
            const daysDiff = Math.abs(latestTs.getTime() - previousTs.getTime()) / (1000 * 60 * 60 * 24);

            if (Number.isNaN(daysDiff) || daysDiff > 30) continue;

            for (const key of Object.keys(latestGrades)) {
                const latestGrade = (latestGrades[key]?.grade || '').toUpperCase();
                const previousGrade = (previousGrades[key]?.grade || '').toUpperCase();

                if (!latestGrade || !previousGrade) continue;
                if (gradeRank[previousGrade] > gradeRank[latestGrade]) {
                    alerts.push({
                        machine_id: machineId,
                        machine_identifier: latest.machine_identifier,
                        custom_name: latest.custom_name,
                        component: componentLabels[key] || key.toUpperCase(),
                        previous_grade: previousGrade,
                        latest_grade: latestGrade,
                        latest_timestamp: latest.timestamp
                    });
                }
            }
        }

        return NextResponse.json({ alerts });
    } catch (error) {
        console.error('Error fetching machine history alerts:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'Failed to fetch machine history alerts' } as ApiError,
            { status: 500 }
        );
    }
}
