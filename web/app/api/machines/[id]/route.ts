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

        const machineParams: SqlParam[] = [id];
        let accessClause = '';

        if (authUser.role === 'Technician' || authUser.role === 'Client' || authUser.role === 'B2CDevice') {
            accessClause = ` AND EXISTS (
                SELECT 1 FROM qc_results qr
                WHERE qr.machine_id = m.id AND qr.technician_id = $2
            )`;
            machineParams.push(authUser.id);
        } else if (authUser.role === 'Refurbisher') {
            accessClause = ` AND EXISTS (
                SELECT 1 FROM qc_results qr
                WHERE qr.machine_id = m.id
                  AND (qr.technician_id = $2 OR qr.technician_id IN (SELECT id FROM users WHERE created_by = $2))
            )`;
            machineParams.push(authUser.id);
        } else if (authUser.role === 'Enterprise' || authUser.role === 'Reseller') {
            accessClause = ` AND (m.owner_user_id = $2 OR EXISTS (
                SELECT 1 FROM qc_results qr
                WHERE qr.machine_id = m.id
                  AND (qr.technician_id = $2 OR qr.technician_id IN (SELECT id FROM users WHERE created_by = $2))
            ))`;
            machineParams.push(authUser.id);
        }

        const machines = await query(
            `SELECT
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
                m.asset_tag,
                m.owner_user_id,
                m.group_id
              FROM machines m
              WHERE m.id = $1${accessClause}`,
            machineParams
        );

        if (machines.length === 0) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Machine not found' } as ApiError,
                { status: 404 }
            );
        }

        const machine = machines[0];
        const historyParams: SqlParam[] = [id];
        let historyClause = '';

        if (authUser.role === 'Technician' || authUser.role === 'Client' || authUser.role === 'B2CDevice') {
            historyClause = ' AND technician_id = $2';
            historyParams.push(authUser.id);
        } else if (authUser.role === 'Refurbisher') {
            historyClause = ' AND (technician_id = $2 OR technician_id IN (SELECT id FROM users WHERE created_by = $2))';
            historyParams.push(authUser.id);
        } else if (authUser.role === 'Enterprise' || authUser.role === 'Reseller') {
            historyClause = ` AND (
                (technician_id = $2 OR technician_id IN (SELECT id FROM users WHERE created_by = $2))
                OR machine_id IN (SELECT id FROM machines WHERE owner_user_id = $2)
            )`;
            historyParams.push(authUser.id);
        }

        const testHistory = await query(
            `SELECT
        id, report_id, timestamp, refurbish_id, overall_pass,
        system_serial, cpu_model, ram_total,
        storage_details_json, battery_details_json, ram_details_json,
        COALESCE(pramaan_grade, overall_grade) as overall_grade
      FROM qc_results
      WHERE machine_id = $1${historyClause}
      ORDER BY timestamp DESC`,
            historyParams
        );

        const historyParams2: SqlParam[] = [id];
        let machineHistoryClause = '';

        if (authUser.role === 'Technician' || authUser.role === 'Client' || authUser.role === 'B2CDevice') {
            machineHistoryClause = ' AND created_by = $2';
            historyParams2.push(authUser.id);
        } else if (authUser.role === 'Refurbisher') {
            machineHistoryClause = ' AND (created_by = $2 OR created_by IN (SELECT id FROM users WHERE created_by = $2))';
            historyParams2.push(authUser.id);
        } else if (authUser.role === 'Enterprise' || authUser.role === 'Reseller') {
            machineHistoryClause = ` AND (
                created_by = $2 OR created_by IN (SELECT id FROM users WHERE created_by = $2)
                OR $2 IN (SELECT owner_user_id FROM machines WHERE id = $1)
            )`;
            historyParams2.push(authUser.id);
        }

        const machineHistory = await query(
            `SELECT id, timestamp, source, component_grades, app_version
             FROM machine_history
             WHERE machine_id = $1${machineHistoryClause}
             ORDER BY timestamp DESC`,
            historyParams2
        );

        return NextResponse.json({
            machine,
            test_history: testHistory,
            machine_history: machineHistory,
        });
    } catch (error) {
        console.error('Error fetching machine details:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'Failed to fetch machine details' } as ApiError,
            { status: 500 }
        );
    }
}

export async function PATCH(
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

        const body = await request.json();
        const customNameRaw = typeof body?.customName === 'string' ? body.customName.trim() : '';
        const customName = customNameRaw.length > 0 ? customNameRaw : null;

        const machineParams: SqlParam[] = [id];
        let accessClause = '';

        if (authUser.role === 'Technician' || authUser.role === 'Client' || authUser.role === 'B2CDevice') {
            accessClause = ` AND EXISTS (
                SELECT 1 FROM qc_results qr
                WHERE qr.machine_id = m.id AND qr.technician_id = $2
            )`;
            machineParams.push(authUser.id);
        } else if (authUser.role === 'Refurbisher') {
            accessClause = ` AND EXISTS (
                SELECT 1 FROM qc_results qr
                WHERE qr.machine_id = m.id
                  AND (qr.technician_id = $2 OR qr.technician_id IN (SELECT id FROM users WHERE created_by = $2))
            )`;
            machineParams.push(authUser.id);
        } else if (authUser.role === 'Enterprise' || authUser.role === 'Reseller') {
            accessClause = ` AND (m.owner_user_id = $2 OR EXISTS (
                SELECT 1 FROM qc_results qr
                WHERE qr.machine_id = m.id
                  AND (qr.technician_id = $2 OR qr.technician_id IN (SELECT id FROM users WHERE created_by = $2))
            ))`;
            machineParams.push(authUser.id);
        }

        const machines = await query(
            `SELECT
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
                m.asset_tag,
                m.owner_user_id,
                m.group_id
              FROM machines m
              WHERE m.id = $1${accessClause}`,
            machineParams
        );

        if (machines.length === 0) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Machine not found' } as ApiError,
                { status: 404 }
            );
        }

        const updated = await query(
            `UPDATE machines
             SET custom_name = $1
             WHERE id = $2
             RETURNING
               id,
               machine_id,
               serial_number,
               mac_address,
               manufacturer,
               model,
               computer_name,
               custom_name,
               last_seen,
               location,
               created_at,
               asset_tag,
               owner_user_id,
               group_id`,
            [customName, id]
        );

        return NextResponse.json({ machine: updated[0] });
    } catch (error) {
        console.error('Error updating machine:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'Failed to update machine' } as ApiError,
            { status: 500 }
        );
    }
}
