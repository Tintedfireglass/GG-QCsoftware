import { NextRequest, NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { PoolClient } from 'pg';
import { generateToken } from '@/lib/auth';
import { ApiError, LoginResponse } from '@/lib/types';

/**
 * Build a deterministic hardware fingerprint from serial + MAC + hostname.
 * Used to uniquely identify a physical machine across activations.
 */
function buildFingerprint(serial: string, mac?: string, hostname?: string): string {
    const parts: string[] = [serial.trim().toUpperCase()];
    if (mac) parts.push(mac.replace(/[^a-zA-Z0-9]/g, '').toUpperCase());
    if (hostname) parts.push(hostname.trim().toUpperCase());
    return parts.join('|');
}

/**
 * Find or create a machine row in the DB. Returns the machine's numeric ID.
 * Machine IDs start at 3000001 (configured via DB sequence).
 */
async function findOrCreateMachine(
    client: PoolClient,
    fingerprint: string,
    serial: string,
    macAddress?: string,
    computerName?: string
): Promise<number> {
    // Try to find existing machine by fingerprint
    const existing = await client.query(
        'SELECT id FROM machines WHERE hardware_fingerprint = $1',
        [fingerprint]
    );

    if (existing.rows.length > 0) {
        // Update last_seen
        await client.query(
            'UPDATE machines SET last_seen = NOW() WHERE id = $1',
            [existing.rows[0].id]
        );
        return existing.rows[0].id;
    }

    // Also check by machine_id field (legacy: might have been created by old QC submission)
    // If the serial already exists, reuse that row to avoid unique constraint violations.
    const legacyMatch = await client.query(
        'SELECT id FROM machines WHERE machine_id = $1',
        [serial]
    );

    if (legacyMatch.rows.length > 0) {
        // Backfill/refresh fingerprint and metadata on existing row
        await client.query(
            `UPDATE machines
             SET hardware_fingerprint = $1,
                 computer_name = $2,
                 mac_address = $3,
                 last_seen = NOW()
             WHERE id = $4`,
            [fingerprint, computerName || null, macAddress || null, legacyMatch.rows[0].id]
        );
        return legacyMatch.rows[0].id;
    }

    // Create new machine — the DB sequence starts at 3000001
    const insertRes = await client.query(
        `INSERT INTO machines (machine_id, serial_number, mac_address, computer_name, hardware_fingerprint, last_seen)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id`,
        [serial, serial, macAddress || null, computerName || null, fingerprint]
    );

    return insertRes.rows[0].id;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { licenseKey, machineSerial, macAddress, computerName } = body;

        if (!licenseKey || !machineSerial) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'licenseKey and machineSerial are required' },
                { status: 400 }
            );
        }

        const normalizedMachineSerial = String(machineSerial).trim();
        const fingerprint = buildFingerprint(normalizedMachineSerial, macAddress, computerName);

        let loginResponse: (LoginResponse & { machineId?: number }) | null = null;

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

            if (license.type === 'demo' && license.demo_runs_used >= (license.demo_max_runs || 1)) {
                throw new Error('This demo key has already been used');
            }

            // 2. Check if this machine is already activated for this key
            const activationRes = await client.query(
                'SELECT * FROM license_key_activations WHERE license_key_id = $1 AND machine_serial = $2',
                [license.id, normalizedMachineSerial]
            );

            const isAlreadyActivated = activationRes.rows.length > 0;

            if (!isAlreadyActivated) {
                if (typeof license.current_uses !== 'number' && process.env.NODE_ENV !== 'production') {
                    console.warn('License key has non-numeric current_uses; treating as 0', {
                        licenseKeyId: license.id,
                        current_uses: license.current_uses,
                    });
                }
                const currentUses = typeof license.current_uses === 'number' ? license.current_uses : 0;
                if (currentUses >= license.max_uses) {
                    throw new Error('This license key has reached its maximum machine activation limit');
                }

                await client.query(
                    'INSERT INTO license_key_activations (license_key_id, machine_serial) VALUES ($1, $2)',
                    [license.id, normalizedMachineSerial]
                );

                await client.query(
                    'UPDATE license_keys SET current_uses = COALESCE(current_uses, 0) + 1 WHERE id = $1',
                    [license.id]
                );
            }

            // 3. Find or create machine → allocate server-side Machine ID
            const machineId = await findOrCreateMachine(
                client, fingerprint, normalizedMachineSerial, macAddress, computerName
            );

            // 4. For customer-owned (B2C) keys, issue a restricted device token
            if (license.customer_user_id) {
                const customerRes = await client.query(
                    'SELECT id, email, is_active FROM customer_users WHERE id = $1',
                    [license.customer_user_id]
                );

                if (customerRes.rows.length === 0 || customerRes.rows[0].is_active !== true) {
                    throw new Error('Customer account not found or inactive for this license key');
                }

                const customer = customerRes.rows[0];
                const deviceToken = generateToken({
                    userId: -Math.abs(customer.id),
                    username: customer.email,
                    role: 'B2CDevice',
                    scope: 'license_device',
                    customerUserId: customer.id,
                });

                loginResponse = {
                    token: deviceToken,
                    user: {
                        id: -Math.abs(customer.id),
                        username: customer.email,
                        role: 'B2CDevice',
                    },
                    machineId,
                };
                return;
            }

            // 5. Login successful — issue token for the license key creator
            const creatorRes = await client.query(
                'SELECT id, username, role FROM users WHERE id = $1',
                [license.created_by]
            );

            if (creatorRes.rows.length === 0) {
                throw new Error('The creator of this license key no longer exists');
            }

            const creator = creatorRes.rows[0];

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
                },
                machineId,
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
