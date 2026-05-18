import { NextRequest, NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { verifyApiKey } from '@/lib/auth';
import { authenticateRequest } from '@/lib/auth-middleware';
import { SubmitQCResultRequest, ApiError } from '@/lib/types';

type SqlParam = string | number | boolean | null;

function normalizeDbGrade(rawGrade?: string | null): string {
    if (!rawGrade) return '';
    const trimmed = rawGrade.trim();
    if (!trimmed) return '';

    const normalized = trimmed.toUpperCase();
    if (normalized === 'N/A' || normalized === 'NA' || normalized === 'NONE' || normalized === '-') {
        return '';
    }
    if (normalized === 'REJECT' || normalized === 'FAIL' || normalized === 'FAILED') {
        return 'F';
    }
    if (normalized === 'PASS' || normalized === 'PASSED') {
        return 'A';
    }

    return trimmed.length <= 2 ? trimmed : trimmed.slice(0, 2);
}

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
        const userIdParam = searchParams.get('userId');
        const overallPass = searchParams.get('overallPass');
        const search = searchParams.get('search')?.trim();
        const includeTotal = searchParams.get('includeTotal') !== '0' && searchParams.get('includeTotal') !== 'false';

        const baseWhereClauses: string[] = ['1=1'];
        const params: SqlParam[] = [];
        let paramCount = 1;

        // Role-based visibility
        if (authUser.role === 'Technician' || authUser.role === 'Client' || authUser.role === 'B2CDevice') {
            baseWhereClauses.push(`qr.technician_id = $${paramCount}`);
            params.push(authUser.id);
            paramCount++;
        } else if (authUser.role === 'Refurbisher' || authUser.role === 'Enterprise' || authUser.role === 'OEM' || authUser.role === 'Insurer' || authUser.role === 'Reseller') {
            baseWhereClauses.push(`(qr.technician_id = $${paramCount} OR qr.technician_id IN (SELECT id FROM users WHERE created_by = $${paramCount}))`);
            params.push(authUser.id);
            paramCount++;
        }

        const needsMachineJoin = !!machineId || !!search;

        if (userIdParam) {
            const requestedUserId = parseInt(userIdParam, 10);
            if (!Number.isFinite(requestedUserId)) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'Invalid userId' } as ApiError,
                    { status: 400 }
                );
            }

            // Prevent technicians/clients/devices from attempting to query other users explicitly.
            if (
                (authUser.role === 'Technician' || authUser.role === 'Client' || authUser.role === 'B2CDevice') &&
                requestedUserId !== authUser.id
            ) {
                return NextResponse.json(
                    { error: 'Authorization Error', message: 'You can only filter your own results' } as ApiError,
                    { status: 403 }
                );
            }

            // Additional scoping; role-based whereClause above still applies for team-based roles.
            baseWhereClauses.push(`qr.technician_id = $${paramCount}`);
            params.push(requestedUserId);
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

        if (machineId) {
            baseWhereClauses.push(`m.machine_id = $${paramCount}`);
            params.push(machineId);
            paramCount++;
        }

        if (search) {
            baseWhereClauses.push(`(
                COALESCE(m.computer_name, '') ILIKE $${paramCount} OR
                COALESCE(m.machine_id, '') ILIKE $${paramCount} OR
                CAST(qr.machine_id AS TEXT) ILIKE $${paramCount} OR
                CAST(qr.id AS TEXT) ILIKE $${paramCount}
            )`);
            params.push(`%${search}%`);
            paramCount++;
        }

        const hasIssues = searchParams.get('hasIssues');
        if (hasIssues === 'true') {
            baseWhereClauses.push(`EXISTS (
                SELECT 1 FROM test_results tr
                WHERE tr.qc_result_id = qr.id
                  AND tr.score < 70
                  AND (
                    LOWER(tr.test_type) LIKE 'cpu%'
                    OR LOWER(tr.test_type) LIKE 'memory%'
                    OR LOWER(tr.test_type) LIKE 'ram%'
                    OR LOWER(tr.test_type) LIKE 'storage%'
                    OR LOWER(tr.test_type) LIKE 'nvme%'
                    OR LOWER(tr.test_type) LIKE 'ssd%'
                    OR LOWER(tr.test_type) LIKE 'smart%'
                    OR (
                      (LOWER(tr.test_type) LIKE 'gpu%' OR LOWER(tr.test_type) LIKE 'graphics%')
                      AND tr.score > 0
                    )
                    OR (
                      LOWER(tr.test_type) LIKE 'battery%'
                      AND (
                        qr.battery_details_json IS NOT NULL
                        AND (qr.battery_details_json->>'isPresent')::boolean IS NOT FALSE
                      )
                    )
                  )
            )`);
        }

        const baseWhereSql = baseWhereClauses.join(' AND ');

        // Performance notes:
        // - Avoid selecting qr.* (large JSON columns) for list views.
        // - Apply search before pagination; avoid window functions over the full filtered set.
        // - Compute expensive "has_issues" only for the paginated rows.
        const queryText = `
      WITH page_rows AS (
        SELECT
          qr.id,
          qr.report_id,
          qr.machine_id,
          qr.timestamp,
          qr.overall_pass,
          qr.pramaan_score,
          qr.pramaan_grade,
          qr.system_manufacturer,
          qr.system_model,
          qr.system_serial,
          qr.app_version,
          m.machine_id as machine_identifier,
          m.computer_name,
          u.username as technician_username,
          u.display_name as technician_name,
          (
            qr.battery_details_json IS NOT NULL
            AND (qr.battery_details_json->>'isPresent')::boolean IS NOT FALSE
          ) AS battery_present
        FROM qc_results qr
        LEFT JOIN machines m ON qr.machine_id = m.id
        LEFT JOIN users u ON qr.technician_id = u.id
        WHERE ${baseWhereSql}
        ORDER BY qr.timestamp DESC, qr.id DESC
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      )
      SELECT
        page_rows.*,
        EXISTS (
          SELECT 1 FROM test_results tr
          WHERE tr.qc_result_id = page_rows.id
            AND tr.score < 70
            AND (
              LOWER(tr.test_type) LIKE 'cpu%'
              OR LOWER(tr.test_type) LIKE 'memory%'
              OR LOWER(tr.test_type) LIKE 'ram%'
              OR LOWER(tr.test_type) LIKE 'storage%'
              OR LOWER(tr.test_type) LIKE 'nvme%'
              OR LOWER(tr.test_type) LIKE 'ssd%'
              OR LOWER(tr.test_type) LIKE 'smart%'
              OR (
                (LOWER(tr.test_type) LIKE 'gpu%' OR LOWER(tr.test_type) LIKE 'graphics%')
                AND tr.score > 0
              )
              OR (
                LOWER(tr.test_type) LIKE 'battery%'
                AND page_rows.battery_present
              )
            )
        ) AS has_issues
      FROM page_rows
      ORDER BY timestamp DESC, id DESC
    `;

        if (!includeTotal) {
            // Used by dashboards/quick views; avoids a potentially expensive COUNT(*).
            const results = await query(queryText, [...params, limit, offset]);
            return NextResponse.json(
                {
                    results,
                    pagination: {
                        total: null,
                        limit,
                        offset,
                        hasMore: results.length === limit,
                    },
                },
                {
                    headers: {
                        // Short private cache to speed back/forward navigation without cross-user leakage.
                        "Cache-Control": "private, max-age=5, stale-while-revalidate=25",
                    },
                }
            );
        }

        const countQuery = needsMachineJoin
            ? `SELECT COUNT(*) as total
               FROM qc_results qr
               LEFT JOIN machines m ON qr.machine_id = m.id
               WHERE ${baseWhereSql}`
            : `SELECT COUNT(*) as total
               FROM qc_results qr
               WHERE ${baseWhereSql}`;

        // Run list + count in parallel to reduce endpoint wall time.
        const [results, countResult] = await Promise.all([
            query(queryText, [...params, limit, offset]),
            query(countQuery, params),
        ]);
        const total = parseInt(countResult[0]?.total || '0', 10);

        return NextResponse.json(
            {
                results,
                pagination: {
                    total,
                    limit,
                    offset,
                    hasMore: offset + limit < total,
                },
            },
            {
                headers: {
                    "Cache-Control": "private, max-age=5, stale-while-revalidate=25",
                },
            }
        );
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

        // Intercept and mark storage as tampered if it has 0% health but passed the SMART self-test.
        // New executables fold SMART into Storage, while older ones may still submit SMART separately.
        if (body.storageDetails?.devices && Array.isArray(body.storageDetails.devices)) {
            const smartTest = body.testResults?.find(t => t.testType === 'SMART' || t.testType === 'Smart');
            const storageTest = body.testResults?.find(t => t.testType === 'Storage');
            const smartDetails = Array.isArray(smartTest?.details)
                ? smartTest.details
                : Array.isArray(storageTest?.details)
                    ? storageTest.details
                    : [];

            let tamperedFound = false;

            for (const device of body.storageDetails.devices) {
                if (device.healthPercent === 0) {
                    const passedSelfTest = smartDetails.some((d: any) => 
                        typeof d === 'string' && d.includes('Self-Test Passed') && device.model && d.includes(device.model)
                    );
                    
                    if (passedSelfTest) {
                        device.isTampered = true;
                        device.tamperReason = "Storage Tampered - Unable to read data";
                        tamperedFound = true;
                    }
                }
            }

            if (tamperedFound) {
                body.storageDetails.isTampered = true;
                body.storageDetails.tamperReason = "Storage Tampered - Unable to read data";

                if (storageTest) {
                    storageTest.passed = false;
                    storageTest.score = 0;
                    storageTest.grade = 'F';
                    storageTest.message = "Storage Tampered - Unable to read data";
                    storageTest.details = ["Storage Tampered - Unable to read data"];
                }
                
                body.overallPass = false;
                if (body.overallScore !== undefined && body.overallScore > 0) {
                    body.overallGrade = 'F';
                }
            }
        }


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

            let licenseError: string | null = null;
            let license = activationRes.rows.length > 0 ? activationRes.rows[0] : null;

            if (!license) {
                licenseError = 'NO_ACTIVATION';
            } else if (!license.is_active) {
                licenseError = 'KEY_DISABLED';
            } else if (license.expires_at && new Date(license.expires_at) < new Date()) {
                licenseError = 'KEY_EXPIRED';
            } else if (license.type === 'demo') {
                const maxRuns = license.demo_max_runs || 1;
                if (license.demo_runs_used >= maxRuns) {
                    licenseError = 'DEMO_USED';
                }
            }

            let isTrialSubmission = false;

            // If there's no valid license, fallback to checking if an active free trial exists
            if (licenseError !== null) {
                const trialRes = await client.query(
                    `SELECT id FROM free_trials
                     WHERE machine_serial = $1
                       AND is_active = true
                       AND trial_end_utc > NOW()`,
                    [machineIdRaw]
                );

                if (trialRes.rows.length > 0) {
                    // Valid active free trial found! Override the license error.
                    isTrialSubmission = true;
                    licenseError = null;
                    license = null;
                } else {
                    // No trial found, throw the original license error
                    throw new Error(licenseError);
                }
            }

            if (!isTrialSubmission && license) {
                if (license.type === 'demo') {
                    const maxRuns = license.demo_max_runs || 1;
                    isDemo = true;
                    demoKeyId = license.id;
                    demoExhausted = license.demo_runs_used + 1 >= maxRuns;
                }
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
                    normalizeDbGrade(body.overallGrade),
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
                    body.technicianId || authUser?.id || null,
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
                            normalizeDbGrade(test.grade),
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
