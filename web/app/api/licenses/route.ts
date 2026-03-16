import { NextRequest, NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { PoolClient } from 'pg';
import { ApiError } from '@/lib/types';
import { authenticateRequest, requireRole } from '@/lib/auth-middleware';

function generateRandomKey(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excluded: 0, O, 1, I
    let result = '';
    for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) result += '-';
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// GET /api/licenses - List license keys created by the admin
export async function GET(request: NextRequest) {
    try {
        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError || !authUser) return authError || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const roleError = requireRole(authUser, ['SuperAdmin', 'Refurbisher', 'Enterprise']);
        if (roleError) return roleError;

        let queryStr = `
            SELECT lk.*, 
                   COUNT(lka.id) as activations_count
            FROM license_keys lk
            LEFT JOIN license_key_activations lka ON lk.id = lka.license_key_id
        `;
        const params: any[] = [];

        if (authUser.role !== 'SuperAdmin') {
            queryStr += ` WHERE lk.created_by = $1`;
            params.push(authUser.id);
        }

        queryStr += ` GROUP BY lk.id ORDER BY lk.created_at DESC`;

        const keys = await query(queryStr, params);

        return NextResponse.json({ keys });
    } catch (error) {
        console.error('List licenses error:', error);
        return NextResponse.json({ error: 'Server Error' }, { status: 500 });
    }
}

// POST /api/licenses - Generate a new license key
export async function POST(request: NextRequest) {
    try {
        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError || !authUser) return authError || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const roleError = requireRole(authUser, ['SuperAdmin', 'Refurbisher', 'Enterprise']);
        if (roleError) return roleError;

        const body = await request.json();
        const { type, max_uses, expires_at } = body;

        if (!type || !['single_use', 'bulk'].includes(type) || !max_uses || max_uses < 1) {
            return NextResponse.json({ error: 'Invalid input parameters' }, { status: 400 });
        }

        // Generate the 16-digit code
        const assignedKey = generateRandomKey();

        let generatedKeyRecord = null;

        // Use a transaction since we might be deducting credits
        await transaction(async (client: PoolClient) => {
            // Check credits if not SuperAdmin
            if (authUser.role !== 'SuperAdmin') {
                const userRes = await client.query('SELECT license_credits FROM users WHERE id = $1', [authUser.id]);
                const credits = userRes.rows[0]?.license_credits || 0;

                if (credits < max_uses) {
                    throw new Error(`Insufficient license credits. You have ${credits} credits, but requested ${max_uses} uses.`);
                }

                // Deduct credits
                await client.query('UPDATE users SET license_credits = license_credits - $1 WHERE id = $2', [max_uses, authUser.id]);
            }

            // Insert new key
            const insertQuery = `
                INSERT INTO license_keys (key, type, max_uses, created_by, is_active, expires_at)
                VALUES ($1, $2, $3, $4, true, $5)
                RETURNING *
            `;
            const result = await client.query(insertQuery, [
                assignedKey, type, max_uses, authUser.id, expires_at ? new Date(expires_at) : null
            ]);

            generatedKeyRecord = result.rows[0];
        });

        if (!generatedKeyRecord) {
            return NextResponse.json({ error: 'Failed to generate key' }, { status: 400 });
        }

        return NextResponse.json({
            message: 'License key generated successfully',
            key: generatedKeyRecord
        });
    } catch (error: any) {
        console.error('Generate license error:', error);
        if (error.message && error.message.includes('Insufficient license credits')) {
            return NextResponse.json({ error: 'Credit Error', message: error.message }, { status: 403 });
        }
        return NextResponse.json({ error: 'Server Error' }, { status: 500 });
    }
}
