import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyApiKey, extractToken, verifyToken } from '@/lib/auth';
import { SubmitQCResultRequest, ApiError } from '@/lib/types';

// GET all QC results (requires JWT authentication)
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

        // Get query parameters for filtering
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');
        const machineId = searchParams.get('machineId');
        const refurbishId = searchParams.get('refurbishId');

        const overallPass = searchParams.get('overallPass');
        const search = searchParams.get('search');

        // Build query
        let queryText = `
      SELECT 
        qr.*,
        m.machine_id as machine_identifier,
        m.location as machine_location
      FROM qc_results qr
      LEFT JOIN machines m ON qr.machine_id = m.id
      WHERE 1=1
    `;
        const params: any[] = [];
        let paramCount = 1;

        if (machineId) {
            queryText += ` AND m.machine_id = $${paramCount}`;
            params.push(machineId);
            paramCount++;
        }

        if (refurbishId) {
            queryText += ` AND qr.refurbish_id = $${paramCount}`;
            params.push(refurbishId);
            paramCount++;
        }

        if (overallPass !== null && overallPass !== undefined) {
            queryText += ` AND qr.overall_pass = $${paramCount}`;
            params.push(overallPass === 'true');
            paramCount++;
        }

        if (search) {
            queryText += ` AND (
                CAST(qr.id AS TEXT) ILIKE $${paramCount} OR 
                qr.refurbish_id ILIKE $${paramCount} OR 
                m.machine_id ILIKE $${paramCount} OR 
                m.serial_number ILIKE $${paramCount} OR
                qr.system_model ILIKE $${paramCount}
            )`;
            params.push(`%${search}%`);
            paramCount++;
        }

        queryText += ` ORDER BY qr.timestamp DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        params.push(limit, offset);

        const results = await query(queryText, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM qc_results qr LEFT JOIN machines m ON qr.machine_id = m.id WHERE 1=1';
        const countParams: any[] = [];
        let countParamNum = 1;

        if (machineId) {
            countQuery += ` AND m.machine_id = $${countParamNum}`;
            countParams.push(machineId);
            countParamNum++;
        }

        if (refurbishId) {
            countQuery += ` AND qr.refurbish_id = $${countParamNum}`;
            countParams.push(refurbishId);
            countParamNum++;
        }

        if (overallPass !== null && overallPass !== undefined) {
            countQuery += ` AND qr.overall_pass = $${countParamNum}`;
            countParams.push(overallPass === 'true');
        }

        const countResult = await query(countQuery, countParams);
        const total = parseInt(countResult[0]?.total || '0');

        return NextResponse.json({
            results,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total,
            },
        });
    } catch (error) {
        console.error('Error fetching QC results:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'Failed to fetch QC results' } as ApiError,
            { status: 500 }
        );
    }
}

// POST submit new QC result (requires API key authentication)
export async function POST(request: NextRequest) {
    try {
        // Verify API key from desktop client
        const apiKey = request.headers.get('x-api-key');

        if (!verifyApiKey(apiKey)) {
            return NextResponse.json(
                { error: 'Authentication Error', message: 'Invalid API key' } as ApiError,
                { status: 401 }
            );
        }

        const body: SubmitQCResultRequest = await request.json();

        // Validate required fields
        if (!body.reportId || !body.machineId || !body.timestamp) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Missing required fields' } as ApiError,
                { status: 400 }
            );
        }

        // Check if report already exists
        const existing = await query(
            'SELECT id FROM qc_results WHERE report_id = $1',
            [body.reportId]
        );

        if (existing.length > 0) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Report ID already exists' } as ApiError,
                { status: 409 }
            );
        }

        // Find or create machine
        let machineDbId: number;
        const machines = await query(
            'SELECT id FROM machines WHERE machine_id = $1',
            [body.machineId]
        );

        if (machines.length > 0) {
            machineDbId = machines[0].id;

            // Update last_seen
            await query(
                `UPDATE machines SET 
          last_seen = NOW(),
          serial_number = COALESCE($1, serial_number),
          mac_address = COALESCE($2, mac_address),
          manufacturer = COALESCE($3, manufacturer),
          model = COALESCE($4, model)
         WHERE id = $5`,
                [
                    body.systemInfo?.serialNumber,
                    body.systemInfo?.macAddress,
                    body.systemInfo?.manufacturer,
                    body.systemInfo?.model,
                    machineDbId,
                ]
            );
        } else {
            // Create new machine
            const newMachine = await query(
                `INSERT INTO machines (machine_id, serial_number, mac_address, manufacturer, model, last_seen)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id`,
                [
                    body.machineId,
                    body.systemInfo?.serialNumber || null,
                    body.systemInfo?.macAddress || null,
                    body.systemInfo?.manufacturer || null,
                    body.systemInfo?.model || null,
                ]
            );
            machineDbId = newMachine[0].id;
        }

        // Insert QC result
        const qcResult = await query(
            `INSERT INTO qc_results (
        report_id, machine_id, timestamp, refurbish_id, technician_notes, overall_pass,
        system_manufacturer, system_model, system_serial, mac_address, cpu_model, ram_total,
        system_info_json, cpu_details_json, ram_details_json, storage_details_json, 
        battery_details_json, device_details_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING id`,
            [
                body.reportId,
                machineDbId,
                body.timestamp,
                body.refurbishId || null,
                body.technicianNotes || null,
                body.overallPass,
                body.systemInfo?.manufacturer || null,
                body.systemInfo?.model || null,
                body.systemInfo?.serialNumber || null,
                body.systemInfo?.macAddress || null,
                body.systemInfo?.cpuModel || null,
                body.systemInfo?.ramTotal || null,
                body.systemInfo ? JSON.stringify(body.systemInfo) : null,
                body.cpuDetails ? JSON.stringify(body.cpuDetails) : null,
                body.ramDetails ? JSON.stringify(body.ramDetails) : null,
                body.storageDetails ? JSON.stringify(body.storageDetails) : null,
                body.batteryDetails ? JSON.stringify(body.batteryDetails) : null,
                body.deviceDetails ? JSON.stringify(body.deviceDetails) : null,
            ]
        );

        const qcResultId = qcResult[0].id;

        // Insert test results
        if (body.testResults && body.testResults.length > 0) {
            for (const test of body.testResults) {
                await query(
                    `INSERT INTO test_results (qc_result_id, test_type, tested, passed, message, details_json, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        qcResultId,
                        test.testType,
                        test.tested,
                        test.passed,
                        test.message || null,
                        test.details ? JSON.stringify(test.details) : null,
                        test.timestamp || null,
                    ]
                );
            }
        }

        return NextResponse.json(
            {
                message: 'QC result submitted successfully',
                id: qcResultId,
                reportId: body.reportId,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Error submitting QC result:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'Failed to submit QC result' } as ApiError,
            { status: 500 }
        );
    }
}
