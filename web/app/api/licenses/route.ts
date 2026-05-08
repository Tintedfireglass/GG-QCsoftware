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

        const roleError = requireRole(authUser, ['SuperAdmin', 'Employee', 'Refurbisher', 'Enterprise', 'Reseller', 'Client']);
        if (roleError) return roleError;

        let queryStr = `
            SELECT
                lk.*,
                COUNT(lka.id) as activations_count,
                cu.full_name as customer_full_name,
                cu.email as customer_email,
                COALESCE(NULLIF(lk.demo_customer_name, ''), cu.full_name, cu.email) as customer_name
            FROM license_keys lk
            LEFT JOIN license_key_activations lka ON lk.id = lka.license_key_id
            LEFT JOIN customer_users cu ON lk.customer_user_id = cu.id
        `;
        const params: any[] = [];

        if (authUser.role !== 'SuperAdmin') {
            queryStr += ` WHERE lk.created_by = $1`;
            params.push(authUser.id);
        }

        queryStr += `
            GROUP BY lk.id, cu.full_name, cu.email
            ORDER BY lk.created_at DESC
        `;

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

        const roleError = requireRole(authUser, ['SuperAdmin', 'Employee', 'Refurbisher', 'Enterprise', 'Reseller', 'Client']);
        if (roleError) return roleError;

        const body = await request.json();
        const { type, max_uses, expires_at, demo_customer_name } = body;

        if (!type || !['single_use', 'bulk', 'demo'].includes(type)) {
            return NextResponse.json({ error: 'Invalid input parameters' }, { status: 400 });
        }

        if (authUser.role === 'Employee' && type !== 'demo') {
            return NextResponse.json({ error: 'Authorization Error', message: 'Employees can only generate demo keys' }, { status: 403 });
        }

        const normalizedMaxUses = type === 'demo' ? 1 : max_uses;

        if (!normalizedMaxUses || normalizedMaxUses < 1) {
            return NextResponse.json({ error: 'Invalid input parameters' }, { status: 400 });
        }

        if (type === 'demo' && !demo_customer_name?.trim()) {
            return NextResponse.json({ error: 'Validation Error', message: 'Customer name is required for demo keys' }, { status: 400 });
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

                if (type !== 'demo' && credits < normalizedMaxUses) {
                    throw new Error(`Insufficient license credits. You have ${credits} credits, but requested ${normalizedMaxUses} uses.`);
                }

                // Deduct credits
                if (type !== 'demo') {
                    await client.query('UPDATE users SET license_credits = license_credits - $1 WHERE id = $2', [normalizedMaxUses, authUser.id]);
                }
            }

            // Insert new key
            const insertQuery = `
                INSERT INTO license_keys (key, type, max_uses, created_by, is_active, expires_at, demo_customer_name, demo_max_runs)
                VALUES ($1, $2, $3, $4, true, $5, $6, $7)
                RETURNING *
            `;
            const result = await client.query(insertQuery, [
                assignedKey,
                type,
                normalizedMaxUses,
                authUser.id,
                expires_at ? new Date(expires_at) : null,
                demo_customer_name?.trim() || null,
                type === 'demo' ? 1 : null,
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

// PATCH /api/licenses - Toggle license key active status
export async function PATCH(request: NextRequest) {
    try {
        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError || !authUser) return authError || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const roleError = requireRole(authUser, ['SuperAdmin', 'Refurbisher', 'Enterprise', 'Reseller', 'Client']);
        if (roleError) return roleError;

        const body = await request.json();
        const { id, is_active } = body;

        if (!id || typeof is_active !== 'boolean') {
            return NextResponse.json({ error: 'Invalid input parameters' }, { status: 400 });
        }

        let updatedKey: any = null;

        await transaction(async (client: PoolClient) => {
            const params: any[] = [is_active, id];
            let ownershipClause = '';
            if (authUser.role !== 'SuperAdmin') {
                ownershipClause = ' AND created_by = $3';
                params.push(authUser.id);
            }

            const updateSql = `
                WITH target AS (
                    SELECT id, is_active
                    FROM license_keys
                    WHERE id = $2${ownershipClause}
                    FOR UPDATE
                ),
                updated AS (
                    UPDATE license_keys
                    SET is_active = $1
                    WHERE id IN (SELECT id FROM target)
                    RETURNING *
                ),
                audit AS (
                    INSERT INTO license_key_audits (
                        license_key_id,
                        action,
                        previous_is_active,
                        new_is_active,
                        performed_by
                    )
                    SELECT
                        target.id,
                        CASE WHEN $1 = true THEN 'enable' ELSE 'disable' END,
                        target.is_active,
                        updated.is_active,
                        $${params.length + 1}
                    FROM target, updated
                    RETURNING 1
                )
                SELECT * FROM updated
            `;

            const result = await client.query(updateSql, [...params, authUser.id]);
            if (result.rows.length === 0) {
                throw new Error('NOT_FOUND');
            }

            updatedKey = result.rows[0];
        });

        return NextResponse.json({ message: 'License key updated', key: updatedKey });
    } catch (error) {
        if (error instanceof Error && error.message === 'NOT_FOUND') {
            return NextResponse.json({ error: 'Not Found', message: 'License key not found or not permitted' }, { status: 404 });
        }
        console.error('Update license error:', error);
        return NextResponse.json({ error: 'Server Error' }, { status: 500 });
    }
}
