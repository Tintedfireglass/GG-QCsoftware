import { NextRequest, NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { PoolClient } from 'pg';
import { generateToken } from '@/lib/auth';

/**
 * Build a deterministic hardware fingerprint from serial + MAC + hostname.
 * Must match the logic in LaptopQC.App/Services/DeviceIdentityService.cs (same field order).
 */
function buildFingerprint(serial: string, mac?: string, hostname?: string): string {
    const parts: string[] = [serial.trim().toUpperCase()];
    if (mac) parts.push(mac.replace(/[^a-zA-Z0-9]/g, '').toUpperCase());
    if (hostname) parts.push(hostname.trim().toUpperCase());
    return parts.join('|');
}

/** Basic email format validator. */
function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Find or create a machine row. Returns the DB machine id (numeric PK).
 * Mirrors the same helper in /api/auth/license/route.ts.
 */
async function findOrCreateMachine(
    client: PoolClient,
    fingerprint: string,
    serial: string,
    macAddress?: string,
    computerName?: string
): Promise<number> {
    const existing = await client.query(
        'SELECT id FROM machines WHERE hardware_fingerprint = $1',
        [fingerprint]
    );
    if (existing.rows.length > 0) {
        await client.query('UPDATE machines SET last_seen = NOW() WHERE id = $1', [existing.rows[0].id]);
        return existing.rows[0].id;
    }

    // Legacy: match by serial
    const legacy = await client.query('SELECT id FROM machines WHERE machine_id = $1', [serial]);
    if (legacy.rows.length > 0) {
        await client.query(
            `UPDATE machines SET hardware_fingerprint=$1, computer_name=$2, mac_address=$3, last_seen=NOW() WHERE id=$4`,
            [fingerprint, computerName ?? null, macAddress ?? null, legacy.rows[0].id]
        );
        return legacy.rows[0].id;
    }

    const res = await client.query(
        `INSERT INTO machines (machine_id, serial_number, mac_address, computer_name, hardware_fingerprint, last_seen)
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
        [serial, serial, macAddress ?? null, computerName ?? null, fingerprint]
    );
    return res.rows[0].id;
}

/**
 * POST /api/auth/trial
 *
 * Request body:
 *   { email, machineSerial, macAddress?, computerName? }
 *
 * Behaviour:
 *   - Active unexpired trial for this fingerprint  → re-login (app restart), returns token
 *   - Expired trial for this fingerprint           → 403 "trial expired"
 *   - Email already used on a different device     → 409 "email already used"
 *   - Fresh request                                → create trial, block email, return token
 *
 * Success (200): { token, user: { id, username, role }, machineId, trialEndsAt }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email, machineSerial, macAddress, computerName } = body;

        if (!email || !machineSerial) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'email and machineSerial are required' },
                { status: 400 }
            );
        }

        const normalizedEmail = email.trim().toLowerCase();
        if (!isValidEmail(normalizedEmail)) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Please enter a valid email address' },
                { status: 400 }
            );
        }

        const fingerprint = buildFingerprint(machineSerial, macAddress, computerName);

        type TrialResponse = {
            token: string;
            user: { id: number; username: string; role: string };
            machineId: number;
            trialEndsAt: string;
        };

        let response: TrialResponse | null = null;

        await transaction(async (client: PoolClient) => {

            // ── 1. Check if this machine already has a trial row ──────────
            const existingTrial = await client.query(
                `SELECT id, email, trial_end_utc, is_active, machine_id
                 FROM free_trials WHERE machine_fingerprint = $1`,
                [fingerprint]
            );

            if (existingTrial.rows.length > 0) {
                const trial = existingTrial.rows[0];
                const now = new Date();
                const trialEnd = new Date(trial.trial_end_utc);

                if (trialEnd <= now || !trial.is_active) {
                    throw Object.assign(
                        new Error('Your 7-day free trial has expired. Please purchase a license key to continue.'),
                        { status: 403 }
                    );
                }

                // Active trial — allow re-login
                const machineDbId: number = trial.machine_id
                    ?? await findOrCreateMachine(client, fingerprint, machineSerial, macAddress, computerName);

                const token = generateToken({
                    userId: 0,
                    username: trial.email,
                    role: 'TrialUser',
                    scope: 'license_device',
                });

                response = {
                    token,
                    user: { id: 0, username: trial.email, role: 'TrialUser' },
                    machineId: machineDbId,
                    trialEndsAt: trial.trial_end_utc,
                };
                return;
            }

            // ── 2. Check if this email is blocked (used on another device) ──
            const emailBlock = await client.query(
                'SELECT id FROM trial_email_blocks WHERE LOWER(email) = $1',
                [normalizedEmail]
            );
            if (emailBlock.rows.length > 0) {
                throw Object.assign(
                    new Error('This email address has already been used for a free trial on another device.'),
                    { status: 409 }
                );
            }

            // ── 3. Create machine row ─────────────────────────────────────
            const machineDbId = await findOrCreateMachine(
                client, fingerprint, machineSerial, macAddress, computerName
            );

            // ── 4. Insert trial row ───────────────────────────────────────
            const trialInsert = await client.query(
                `INSERT INTO free_trials
                    (email, machine_fingerprint, machine_serial, mac_address, computer_name, machine_id, trial_end_utc)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '7 days')
                 RETURNING id, trial_end_utc`,
                [normalizedEmail, fingerprint, machineSerial, macAddress ?? null, computerName ?? null, machineDbId]
            );
            const newTrial = trialInsert.rows[0];

            // ── 5. Block the email globally ───────────────────────────────
            await client.query(
                'INSERT INTO trial_email_blocks (email, trial_id) VALUES ($1, $2)',
                [normalizedEmail, newTrial.id]
            );

            // ── 6. Issue token ────────────────────────────────────────────
            const token = generateToken({
                userId: 0,
                username: normalizedEmail,
                role: 'TrialUser',
                scope: 'license_device',
            });

            response = {
                token,
                user: { id: 0, username: normalizedEmail, role: 'TrialUser' },
                machineId: machineDbId,
                trialEndsAt: newTrial.trial_end_utc,
            };
        });

        if (response) return NextResponse.json(response);
        throw new Error('Unknown error during trial activation');

    } catch (error: any) {
        console.error('Trial activation error:', error);
        const status = error.status ?? (error.message?.includes('Validation') ? 400 : 409);
        return NextResponse.json(
            { error: 'Trial Error', message: error.message ?? 'An error occurred during trial activation' },
            { status }
        );
    }
}
