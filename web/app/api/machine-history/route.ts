import { NextRequest, NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { verifyApiKey } from '@/lib/auth';
import { authenticateRequest } from '@/lib/auth-middleware';
import { ApiError, SubmitMachineHistoryRequest } from '@/lib/types';

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
        if (!authUser) {
            return NextResponse.json(
                { error: 'Authentication Error', message: 'Not authenticated' } as ApiError,
                { status: 401 }
            );
        }

        const body: SubmitMachineHistoryRequest = await request.json();

        if (!body.machineId || !body.source || !body.componentGrades || typeof body.componentGrades !== 'object') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Missing required fields' } as ApiError,
                { status: 400 }
            );
        }

        const machineIdRaw = body.machineId.trim();
        if (!machineIdRaw) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Missing machine identifier' } as ApiError,
                { status: 400 }
            );
        }

        let historyId: number | null = null;

        await transaction(async (client) => {
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
                    `UPDATE machines SET last_seen = NOW() WHERE id = $1`,
                    [machineDbId]
                );
            } else {
                const newMachine = await client.query(
                    `INSERT INTO machines (machine_id, last_seen)
                     VALUES ($1, NOW())
                     RETURNING id`,
                    [machineIdRaw]
                );
                machineDbId = newMachine.rows[0].id;
            }

            const insertResult = await client.query(
                `INSERT INTO machine_history (
                    machine_id,
                    timestamp,
                    source,
                    component_grades,
                    created_by,
                    app_version
                 ) VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id`,
                [
                    machineDbId,
                    body.timestamp ? new Date(body.timestamp) : new Date(),
                    body.source,
                    JSON.stringify(body.componentGrades),
                    authUser.id,
                    body.appVersion || null
                ]
            );

            historyId = insertResult.rows[0].id;
        });

        return NextResponse.json(
            {
                message: 'Machine history submitted successfully',
                id: historyId
            },
            { status: 201 }
        );
    } catch (error) {
        if (error instanceof Error) {
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
        }
        console.error('Error submitting machine history:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'Failed to submit machine history' } as ApiError,
            { status: 500 }
        );
    }
}
