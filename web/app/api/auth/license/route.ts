import { NextRequest, NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { PoolClient } from 'pg';
import { generateToken } from '@/lib/auth';
import { ApiError, LoginResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { licenseKey, machineSerial } = body;

        if (!licenseKey || !machineSerial) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'licenseKey and machineSerial are required' },
                { status: 400 }
            );
        }

        let loginResponse: LoginResponse | null = null;

        await transaction(async (client: PoolClient) => {
            // 1. Fetch the license key
            const keyRes = await client.query(
                'SELECT * FROM license_keys WHERE key = $1',
                [licenseKey]
            );

            if (keyRes.rows.length === 0) {
                throw new Error('Invalid license key');
            }

            const license = keyRes.rows[0];

            if (!license.is_active) {
                throw new Error('This license key has been revoked');
            }

            if (license.expires_at && new Date(license.expires_at) < new Date()) {
                throw new Error('This license key has expired');
            }

            // 2. Check if this machine is already activated for this key
            const activationRes = await client.query(
                'SELECT * FROM license_key_activations WHERE license_key_id = $1 AND machine_serial = $2',
                [license.id, machineSerial]
            );

            const isAlreadyActivated = activationRes.rows.length > 0;

            if (!isAlreadyActivated) {
                // Must activate. Check if there are uses remaining
                if (license.current_uses >= license.max_uses) {
                    throw new Error('This license key has reached its maximum machine activation limit');
                }

                // Insert activation
                await client.query(
                    'INSERT INTO license_key_activations (license_key_id, machine_serial) VALUES ($1, $2)',
                    [license.id, machineSerial]
                );

                // Increment current_uses
                await client.query(
                    'UPDATE license_keys SET current_uses = current_uses + 1 WHERE id = $1',
                    [license.id]
                );
            }

            // 3. Login successful. Get the creator of the key to issue a token on their behalf
            const creatorRes = await client.query(
                'SELECT id, username, role FROM users WHERE id = $1',
                [license.created_by]
            );

            if (creatorRes.rows.length === 0) {
                throw new Error('The creator of this license key no longer exists');
            }

            const creator = creatorRes.rows[0];

            // Generate token representing the creator
            const token = generateToken({
                userId: creator.id,
                username: creator.username,
                role: creator.role,
            });

            loginResponse = {
                token,
                user: {
                    id: creator.id,
                    username: creator.username,
                    role: creator.role,
                }
            };
        });

        if (loginResponse) {
            return NextResponse.json(loginResponse);
        } else {
            throw new Error('Unknown error during license validation');
        }

    } catch (error: any) {
        console.error('License login error:', error);
        const code = error.message.includes('Validation') ? 400 : 401;
        return NextResponse.json(
            { error: 'Authentication Error', message: error.message || 'An error occurred during license login' },
            { status: code }
        );
    }
}
