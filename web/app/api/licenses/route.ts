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

        // Validate expires_at duration against per-user permissions for non-SuperAdmin/Employee users
        const isPrivilegedUser = authUser.role === 'SuperAdmin' || authUser.role === 'Employee';
        if (!isPrivilegedUser && expires_at && type !== 'demo') {
            // Fetch the user's permission flags fresh from DB
            const userPerms = await query(
                'SELECT allow_monthly_keys, allow_quarterly_keys, allow_6month_keys, allow_yearly_keys FROM users WHERE id = $1',
                [authUser.id]
            );
            const perms = userPerms[0] || {};
            const expiryDate = new Date(expires_at);
            const nowDate = new Date();
            const diffDays = Math.round((expiryDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));

            const DURATION_MAP = [
                { days: 30, flag: perms.allow_monthly_keys, label: 'monthly' },
                { days: 90, flag: perms.allow_quarterly_keys, label: 'quarterly' },
                { days: 180, flag: perms.allow_6month_keys, label: '6-month' },
                { days: 365, flag: perms.allow_yearly_keys, label: 'yearly' },
            ];

            const matched = DURATION_MAP.find(d => d.flag && Math.abs(diffDays - d.days) <= 2);
            if (!matched) {
                return NextResponse.json(
                    { error: 'Authorization Error', message: 'You are not permitted to set this expiry duration' },
                    { status: 403 }
                );
            }
        }

        // Prevent non-privileged users from setting expires_at when they have no permissions
        if (!isPrivilegedUser && expires_at && type !== 'demo') {
            // Already validated above — this block intentionally left as a guard
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
                INSERT INTO license_keys (key, type, max_uses, current_uses, created_by, is_active, expires_at, demo_customer_name, demo_max_runs)
                VALUES ($1, $2, $3, 0, $4, true, $5, $6, $7)
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

// PATCH /api/licenses - Update license key (toggle active status and/or expiry date)
export async function PATCH(request: NextRequest) {
    try {
        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError || !authUser) return authError || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const roleError = requireRole(authUser, ['SuperAdmin', 'Refurbisher', 'Enterprise', 'Reseller', 'Client']);
        if (roleError) return roleError;

        const body = await request.json();
        const { id, is_active, expires_at } = body;

        if (!id || (is_active === undefined && expires_at === undefined)) {
            return NextResponse.json({ error: 'Invalid input parameters' }, { status: 400 });
        }

        let updatedKey: any = null;

        await transaction(async (client: PoolClient) => {
            const hasIsActive = is_active !== undefined;
            const hasExpiresAt = expires_at !== undefined;

            const params: any[] = [];
            let paramIdx = 1;

            const setClauses: string[] = [];
            let isActiveParamIdx = -1;

            if (hasIsActive) {
                setClauses.push(`is_active = $${paramIdx}`);
                isActiveParamIdx = paramIdx;
                params.push(is_active);
                paramIdx++;
            }

            if (hasExpiresAt) {
                setClauses.push(`expires_at = $${paramIdx}`);
                params.push(expires_at ? new Date(expires_at) : null);
                paramIdx++;
            }

            const idParamIdx = paramIdx++;
            params.push(id);

            let ownershipClause = '';
            if (authUser.role !== 'SuperAdmin') {
                ownershipClause = ` AND created_by = $${paramIdx++}`;
                params.push(authUser.id);
            }

            const authUserParamIdx = paramIdx;

            const auditCte = hasIsActive ? `,
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
                        CASE WHEN $${isActiveParamIdx} = true THEN 'enable' ELSE 'disable' END,
                        target.is_active,
                        updated.is_active,
                        $${authUserParamIdx}
                    FROM target, updated
                    RETURNING 1
                )` : '';

            const updateSql = `
                WITH target AS (
                    SELECT id, is_active
                    FROM license_keys
                    WHERE id = $${idParamIdx}${ownershipClause}
                    FOR UPDATE
                ),
                updated AS (
                    UPDATE license_keys
                    SET ${setClauses.join(', ')}
                    WHERE id IN (SELECT id FROM target)
                    RETURNING *
                )
                ${auditCte}
                SELECT * FROM updated
            `;

            const queryParams = [...params];
            if (hasIsActive) {
                queryParams.push(authUser.id);
            }

            const result = await client.query(updateSql, queryParams);
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
