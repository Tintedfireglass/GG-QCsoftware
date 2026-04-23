import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authenticateRequest, requireRole } from '@/lib/auth-middleware';
import { ApiError } from '@/lib/types';

// GET /api/fleet - List Enterprise fleet machines with health summary
export async function GET(request: NextRequest) {
    try {
        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError || !authUser) return authError || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Only Enterprise, Reseller, and SuperAdmin can access fleet
        const roleError = requireRole(authUser, ['SuperAdmin', 'Enterprise', 'Reseller']);
        if (roleError) return roleError;

        const { searchParams } = new URL(request.url);
        const groupId = searchParams.get('group_id');
        const search = searchParams.get('search')?.trim();

        const params: any[] = [];
        const whereClauses: string[] = [];
        let paramCount = 1;

        // Enterprise/Reseller sees only their owned machines
        if (authUser.role === 'Enterprise' || authUser.role === 'Reseller') {
            whereClauses.push(`m.owner_user_id = $${paramCount}`);
            params.push(authUser.id);
            paramCount++;
        }

        if (groupId) {
            whereClauses.push(`m.group_id = $${paramCount}`);
            params.push(parseInt(groupId));
            paramCount++;
        }

        if (search) {
            whereClauses.push(`(
                m.machine_id ILIKE $${paramCount} OR
                m.serial_number ILIKE $${paramCount} OR
                m.manufacturer ILIKE $${paramCount} OR
                m.model ILIKE $${paramCount} OR
                COALESCE(m.computer_name, '') ILIKE $${paramCount} OR
                COALESCE(m.asset_tag, '') ILIKE $${paramCount}
            )`);
            params.push(`%${search}%`);
            paramCount++;
        }

        const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const machines = await query(
            `SELECT
                m.id,
                m.machine_id,
                m.serial_number,
                m.manufacturer,
                m.model,
                m.asset_tag,
                m.group_id,
                m.last_seen,
                mg.name as group_name,
                latest_qr.pramaan_score as latest_score,
                latest_qr.pramaan_grade as latest_grade,
                latest_qr.timestamp as latest_test_date,
                COALESCE(mle.lifecycle_event_count, 0) as lifecycle_event_count
            FROM machines m
            LEFT JOIN machine_groups mg ON m.group_id = mg.id
            LEFT JOIN (
                SELECT machine_id, COUNT(*)::int as lifecycle_event_count
                FROM machine_lifecycle_events
                GROUP BY machine_id
            ) mle ON mle.machine_id = m.id
            LEFT JOIN LATERAL (
                SELECT pramaan_score, pramaan_grade, timestamp
                FROM qc_results
                WHERE machine_id = m.id
                ORDER BY timestamp DESC
                LIMIT 1
            ) latest_qr ON true
            ${whereSQL}
            ORDER BY m.last_seen DESC NULLS LAST`,
            params
        );

        // Fleet summary stats
        const totalMachines = machines.length;
        const testedMachines = machines.filter((m: any) => m.latest_score !== null).length;
        const avgScore = testedMachines > 0
            ? Math.round(machines.reduce((sum: number, m: any) => sum + (m.latest_score || 0), 0) / testedMachines)
            : 0;

        return NextResponse.json({
            machines,
            summary: {
                total: totalMachines,
                tested: testedMachines,
                untested: totalMachines - testedMachines,
                avgScore,
            }
        });
    } catch (error) {
        console.error('Fleet list error:', error);
        return NextResponse.json({ error: 'Server Error', message: 'Failed to fetch fleet' } as ApiError, { status: 500 });
    }
}

// POST /api/fleet - Enroll a machine into the Enterprise fleet
export async function POST(request: NextRequest) {
    try {
        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError || !authUser) return authError || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const roleError = requireRole(authUser, ['SuperAdmin', 'Enterprise', 'Reseller']);
        if (roleError) return roleError;

        const body = await request.json();
        const { machine_id, asset_tag, group_id, serial_number, manufacturer, model } = body;

        if (!machine_id) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'machine_id is required' } as ApiError,
                { status: 400 }
            );
        }

        // Check if machine already exists
        const existing = await query('SELECT id, owner_user_id FROM machines WHERE machine_id = $1', [machine_id]);

        let machineDbId: number;

        if (existing.length > 0) {
            // Claim existing machine for this Enterprise
            machineDbId = existing[0].id;
            await query(
                `UPDATE machines SET owner_user_id = $1, asset_tag = COALESCE($2, asset_tag), group_id = $3 WHERE id = $4`,
                [authUser.id, asset_tag || null, group_id || null, machineDbId]
            );
        } else {
            // Create new machine entry
            const result = await query(
                `INSERT INTO machines (machine_id, serial_number, manufacturer, model, asset_tag, owner_user_id, group_id, last_seen)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                 RETURNING id`,
                [machine_id, serial_number || null, manufacturer || null, model || null, asset_tag || null, authUser.id, group_id || null]
            );
            machineDbId = result[0].id;
        }

        // Record lifecycle event
        await query(
            `INSERT INTO machine_lifecycle_events (machine_id, event_type, notes, recorded_by)
             VALUES ($1, 'enrolled', $2, $3)`,
            [machineDbId, `Enrolled into fleet by ${authUser.username}`, authUser.id]
        );

        return NextResponse.json({
            message: 'Machine enrolled in fleet',
            machine_id: machineDbId,
        }, { status: 201 });
    } catch (error) {
        console.error('Fleet enroll error:', error);
        return NextResponse.json({ error: 'Server Error', message: 'Failed to enroll machine' } as ApiError, { status: 500 });
    }
}
