import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';
import { ApiError } from '@/lib/types';

type SqlParam = string | number | boolean | null;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError) return authError;
        if (!authUser) {
            return NextResponse.json(
                { error: 'Authentication Error', message: 'Not authenticated' } as ApiError,
                { status: 401 }
            );
        }

        const queryParams: SqlParam[] = [id];
        let roleClause = '';

        if (authUser.role === 'Technician' || authUser.role === 'Client' || authUser.role === 'B2CDevice') {
            roleClause = ' AND qr.technician_id = $2';
            queryParams.push(authUser.id);
        } else if (authUser.role === 'Refurbisher' || authUser.role === 'Enterprise' || authUser.role === 'Reseller') {
            roleClause = ' AND (qr.technician_id = $2 OR qr.technician_id IN (SELECT id FROM users WHERE created_by = $2))';
            queryParams.push(authUser.id);
        }

        const results = await query(
            `SELECT
        qr.*,
        m.machine_id as machine_identifier,
        m.location as machine_location,
        m.manufacturer as machine_manufacturer,
        m.model as machine_model,
        m.computer_name
      FROM qc_results qr
      LEFT JOIN machines m ON qr.machine_id = m.id
      WHERE qr.id = $1${roleClause}`,
            queryParams
        );

        if (results.length === 0) {
            return NextResponse.json(
                { error: 'Not Found', message: 'QC result not found' } as ApiError,
                { status: 404 }
            );
        }

        const qcResult = results[0];
        const testResults = await query(
            'SELECT * FROM test_results WHERE qc_result_id = $1 ORDER BY test_type',
            [qcResult.id]
        );

        // Fetch the previous QC result for this machine (for hardware change detection)
        const previousResult = qcResult.machine_id
            ? await query(
                  `SELECT id, report_id, timestamp, cpu_model, ram_total,
                          storage_details_json, battery_details_json, ram_details_json,
                          system_serial
                   FROM qc_results
                   WHERE machine_id = $1 AND timestamp < $2
                   ORDER BY timestamp DESC
                   LIMIT 1`,
                  [qcResult.machine_id, qcResult.timestamp]
              )
            : [];

        return NextResponse.json({
            ...qcResult,
            test_results: testResults,
            previous_result: previousResult.length > 0 ? previousResult[0] : null,
        });

    } catch (error) {
        console.error('Error fetching QC result:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'Failed to fetch QC result' } as ApiError,
            { status: 500 }
        );
    }
}
