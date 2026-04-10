import { NextRequest, NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { verifyApiKey } from '@/lib/auth';
import { authenticateRequest } from '@/lib/auth-middleware';
import { SubmitQCResultRequest, ApiError } from '@/lib/types';

type SqlParam = string | number | boolean | null;

// GET all QC results (requires JWT authentication)
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
        const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
        const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);
        const machineId = searchParams.get('machineId');
        const refurbishId = searchParams.get('refurbishId');
        const overallPass = searchParams.get('overallPass');
        const search = searchParams.get('search')?.trim();

        const baseWhereClauses: string[] = ['1=1'];
        const params: SqlParam[] = [];
        let paramCount = 1;

        // Role-based visibility
        if (authUser.role === 'Technician' || authUser.role === 'Client' || authUser.role === 'B2CDevice') {
            baseWhereClauses.push(`qr.technician_id = $${paramCount}`);
            params.push(authUser.id);
            paramCount++;
        } else if (authUser.role === 'Refurbisher' || authUser.role === 'Enterprise' || authUser.role === 'Reseller') {
            baseWhereClauses.push(`(qr.technician_id = $${paramCount} OR qr.technician_id IN (SELECT id FROM users WHERE created_by = $${paramCount}))`);
            params.push(authUser.id);
            paramCount++;
        }

        if (machineId) {
            baseWhereClauses.push(`m.machine_id = $${paramCount}`);
            params.push(machineId);
            paramCount++;
        }

        if (refurbishId) {
            baseWhereClauses.push(`qr.refurbish_id = $${paramCount}`);
            params.push(refurbishId);
            paramCount++;
        }

        if (overallPass !== null && overallPass !== undefined) {
            baseWhereClauses.push(`qr.overall_pass = $${paramCount}`);
            params.push(overallPass === 'true');
            paramCount++;
        }

        const baseWhereSql = baseWhereClauses.join(' AND ');
        let searchWhereSql = '1=1';

        if (search) {
            searchWhereSql = `(
                COALESCE(numbered.computer_name, '') ILIKE $${paramCount}
            )`;
            params.push(`%${search}%`);
            paramCount++;
        }

        const queryText = `
      WITH filtered AS (
        SELECT
          qr.*,
          m.machine_id as machine_identifier,
          m.location as machine_location,
          m.computer_name,
          u.username as technician_username,
          u.display_name as technician_name
        FROM qc_results qr
        LEFT JOIN machines m ON qr.machine_id = m.id
        LEFT JOIN users u ON qr.technician_id = u.id
        WHERE ${baseWhereSql}
      ),
      numbered AS (
        SELECT
          filtered.*,
          ROW_NUMBER() OVER (ORDER BY filtered.timestamp DESC, filtered.id DESC) AS scoped_test_id
        FROM filtered
      )
      SELECT *
      FROM numbered
      WHERE ${searchWhereSql}
      ORDER BY timestamp DESC, id DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

        const results = await query(queryText, [...params, limit, offset]);

        const countQuery = `
      WITH filtered AS (
        SELECT
          qr.*,
          m.machine_id as machine_identifier,
          m.computer_name,
          u.username as technician_username,
          u.display_name as technician_name
        FROM qc_results qr
        LEFT JOIN machines m ON qr.machine_id = m.id
        LEFT JOIN users u ON qr.technician_id = u.id
        WHERE ${baseWhereSql}
      ),
      numbered AS (
        SELECT
          filtered.*,
          ROW_NUMBER() OVER (ORDER BY filtered.timestamp DESC, filtered.id DESC) AS scoped_test_id
        FROM filtered
      )
      SELECT COUNT(*) as total
      FROM numbered
      WHERE ${searchWhereSql}
    `;

        const countResult = await query(countQuery, params);
        const total = parseInt(countResult[0]?.total || '0', 10);

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
        const apiKey = request.headers.get('x-api-key');

        if (!verifyApiKey(apiKey)) {
            return NextResponse.json(
                { error: 'Authentication Error', message: 'Invalid API key' } as ApiError,
                { status: 401 }
            );
        }

        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError) return authError;

        const legacyCutoffUtc = new Date('2026-04-12T23:59:59Z');
        const nowUtc = new Date();
        const legacyWindowOpen = nowUtc <= legacyCutoffUtc;

        if (!authUser && !legacyWindowOpen) {
            return NextResponse.json(
                { error: 'Authentication Error', message: 'Please update to the latest version to submit results.' } as ApiError,
                { status: 426 }
            );
        }

        const body: SubmitQCResultRequest = await request.json();

        const forwardedFor = request.headers.get('x-forwarded-for') || request.headers.get('x-vercel-forwarded-for');
        const forwarded = request.headers.get('forwarded');
        const forwardedIp = forwarded?.match(/for="?([^;,"]+)"?/i)?.[1];
        const submissionIp =
            forwardedFor?.split(',')[0]?.trim() ||
            forwardedIp ||
            request.headers.get('x-real-ip') ||
            request.headers.get('cf-connecting-ip') ||
            request.headers.get('true-client-ip') ||
            request.headers.get('x-client-ip') ||
            request.headers.get('fly-client-ip') ||
            null;

        if (!body.reportId || !body.machineId || !body.timestamp) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Missing required fields' } as ApiError,
                { status: 400 }
            );
        }

        const machineIdRaw = body.machineId?.trim();
        if (!machineIdRaw) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Missing machine identifier' } as ApiError,
                { status: 400 }
            );
        }

        let qcResultId: number | null = null;
        let demoKeyId: number | null = null;
        let isDemo = false;
        let demoExhausted = false;

        await transaction(async (client) => {
            const existing = await client.query(
                'SELECT id FROM qc_results WHERE report_id = $1',
                [body.reportId]
            );
            if (existing.rows.length > 0) {
                throw new Error('REPORT_EXISTS');
            }

            const activationRes = await client.query(
                `SELECT lk.*
                 FROM license_key_activations lka
                 JOIN license_keys lk ON lk.id = lka.license_key_id
                 WHERE lka.machine_serial = $1
                 ORDER BY lka.activated_at DESC
                 LIMIT 1`,
                [machineIdRaw]
            );

            if (activationRes.rows.length === 0) {
                throw new Error('NO_ACTIVATION');
            }

            const license = activationRes.rows[0];

            if (!license.is_active) {
                throw new Error('KEY_DISABLED');
            }

            if (license.expires_at && new Date(license.expires_at) < new Date()) {
                throw new Error('KEY_EXPIRED');
            }

            if (license.type === 'demo') {
                const maxRuns = license.demo_max_runs || 1;
                if (license.demo_runs_used >= maxRuns) {
                    throw new Error('DEMO_USED');
                }
                isDemo = true;
                demoKeyId = license.id;
                demoExhausted = license.demo_runs_used + 1 >= maxRuns;
            }

            let machineDbId: number;
            const machineIdIsNumeric = !!machineIdRaw && /^[0-9]+$/.test(machineIdRaw);
            const machineIdAsNumber = machineIdIsNumeric ? parseInt(machineIdRaw!, 10) : null;

            let machines = machineIdAsNumber
                ? (await client.query('SELECT id FROM machines WHERE id = $1', [machineIdAsNumber])).rows
                : [];

            if (machines.length === 0) {
                machines = (await client.query(
                    'SELECT id FROM machines WHERE machine_id = $1',
                    [machineIdRaw]
                )).rows;
            }

            if (machines.length > 0) {
                machineDbId = machines[0].id;

                await client.query(
                    `UPDATE machines SET
              last_seen = NOW(),
              serial_number = COALESCE($1, serial_number),
              mac_address = COALESCE($2, mac_address),
              manufacturer = COALESCE($3, manufacturer),
              model = COALESCE($4, model),
              computer_name = COALESCE($5, computer_name)
             WHERE id = $6`,
                    [
                        body.systemInfo?.serialNumber,
                        body.systemInfo?.macAddress,
                        body.systemInfo?.manufacturer,
                        body.systemInfo?.model,
                        body.systemInfo?.computerName || null,
                        machineDbId,
                    ]
                );
            } else {
                const newMachine = await client.query(
                    `INSERT INTO machines (machine_id, serial_number, mac_address, manufacturer, model, computer_name, last_seen)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             RETURNING id`,
                    [
                        machineIdRaw,
                        body.systemInfo?.serialNumber || null,
                        body.systemInfo?.macAddress || null,
                        body.systemInfo?.manufacturer || null,
                        body.systemInfo?.model || null,
                        body.systemInfo?.computerName || null,
                    ]
                );
                machineDbId = newMachine.rows[0].id;
            }

            const qcResult = await client.query(
                `INSERT INTO qc_results (
            report_id, machine_id, timestamp, refurbish_id, technician_notes, app_version, overall_pass,
            overall_score, overall_grade,
            system_manufacturer, system_model, system_serial, mac_address, cpu_model, ram_total,
            system_info_json, cpu_details_json, ram_details_json, storage_details_json,
            battery_details_json, device_details_json, submission_ip, technician_id,
            pramaan_score, health_id, pramaan_hash, pramaan_grade, pramaan_category_scores, pramaan_risk_flags, pramaan_algorithm_version,
            is_demo, demo_license_key_id
          ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
          RETURNING id`,
                [
                    body.reportId,
                    machineDbId,
                    body.refurbishId || null,
                    body.technicianNotes || null,
                    body.appVersion || null,
                    body.overallPass,
                    body.overallScore || 0,
                    body.overallGrade || '',
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
                    submissionIp,
                    body.technicianId || null,
                    body.pramaanScore ?? null,
                    body.healthId || null,
                    body.pramaanHash || null,
                    body.pramaanGrade || null,
                    body.pramaanCategoryScores ? JSON.stringify(body.pramaanCategoryScores) : null,
                    body.pramaanRiskFlags ? JSON.stringify(body.pramaanRiskFlags) : null,
                    body.pramaanAlgorithmVersion || null,
                    isDemo,
                    demoKeyId,
                ]
            );

            qcResultId = qcResult.rows[0].id;

            if (body.testResults && body.testResults.length > 0) {
                for (const test of body.testResults) {
                    await client.query(
                        `INSERT INTO test_results (qc_result_id, test_type, tested, passed, score, grade, message, details_json, timestamp)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
                        [
                            qcResultId,
                            test.testType,
                            test.tested,
                            test.passed,
                            test.score || 0,
                            test.grade || '',
                            test.message || null,
                            test.details ? JSON.stringify(test.details) : null,
                        ]
                    );
                }
            }

            if (isDemo && demoKeyId) {
                await client.query(
                    `UPDATE license_keys
                     SET demo_runs_used = COALESCE(demo_runs_used, 0) + 1,
                         is_active = CASE WHEN COALESCE(demo_runs_used, 0) + 1 >= COALESCE(demo_max_runs, 1) THEN false ELSE is_active END
                     WHERE id = $1`,
                    [demoKeyId]
                );
            }
        });

        return NextResponse.json(
            {
                message: 'QC result submitted successfully',
                id: qcResultId,
                reportId: body.reportId,
                demoExhausted
            },
            { status: 201 }
        );
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === 'REPORT_EXISTS') {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'Report ID already exists' } as ApiError,
                    { status: 409 }
                );
            }
            if (error.message === 'NO_ACTIVATION') {
                return NextResponse.json(
                    { error: 'Authorization Error', message: 'This machine is not activated with a license key' } as ApiError,
                    { status: 403 }
                );
            }
            if (error.message === 'KEY_DISABLED') {
                return NextResponse.json(
                    { error: 'Authorization Error', message: 'The license key for this machine has been disabled' } as ApiError,
                    { status: 403 }
                );
            }
            if (error.message === 'KEY_EXPIRED') {
                return NextResponse.json(
                    { error: 'Authorization Error', message: 'The license key for this machine has expired' } as ApiError,
                    { status: 403 }
                );
            }
            if (error.message === 'DEMO_USED') {
                return NextResponse.json(
                    { error: 'Authorization Error', message: 'This demo license has already been used' } as ApiError,
                    { status: 403 }
                );
            }
        }
        console.error('Error submitting QC result:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'Failed to submit QC result' } as ApiError,
            { status: 500 }
        );
    }
}
