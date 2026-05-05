import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authenticateRequest, requireRole } from '@/lib/auth-middleware';
import { ApiError } from '@/lib/types';

// GET /api/fleet/[machineId]/lifecycle - Get lifecycle events for a machine
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ machineId: string }> }
) {
    try {
        const { machineId } = await params;
        const id = parseInt(machineId);
        if (isNaN(id)) {
            return NextResponse.json({ error: 'Validation Error', message: 'Invalid machine ID' } as ApiError, { status: 400 });
        }

        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError || !authUser) return authError || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const roleError = requireRole(authUser, ['SuperAdmin', 'Enterprise', 'Reseller']);
        if (roleError) return roleError;

        // Verify this machine belongs to the Enterprise/Reseller user
        if (authUser.role === 'Enterprise' || authUser.role === 'OEM' || authUser.role === 'Insurer' || authUser.role === 'Reseller') {
            const machineCheck = await query('SELECT id FROM machines WHERE id = $1 AND owner_user_id = $2', [id, authUser.id]);
            if (machineCheck.length === 0) {
                return NextResponse.json({ error: 'Not Found', message: 'Machine not found in your fleet' } as ApiError, { status: 404 });
            }
        }

        const events = await query(
            `SELECT
                mle.*,
                u.username as recorded_by_username
            FROM machine_lifecycle_events mle
            LEFT JOIN users u ON mle.recorded_by = u.id
            WHERE mle.machine_id = $1
            ORDER BY mle.created_at DESC`,
            [id]
        );

        return NextResponse.json({ events });
    } catch (error) {
        console.error('Lifecycle GET error:', error);
        return NextResponse.json({ error: 'Server Error', message: 'Failed to fetch lifecycle events' } as ApiError, { status: 500 });
    }
}

// POST /api/fleet/[machineId]/lifecycle - Add a lifecycle event
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ machineId: string }> }
) {
    try {
        const { machineId } = await params;
        const id = parseInt(machineId);
        if (isNaN(id)) {
            return NextResponse.json({ error: 'Validation Error', message: 'Invalid machine ID' } as ApiError, { status: 400 });
        }

        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError || !authUser) return authError || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const roleError = requireRole(authUser, ['SuperAdmin', 'Enterprise', 'Reseller']);
        if (roleError) return roleError;

        // Verify ownership
        if (authUser.role === 'Enterprise' || authUser.role === 'OEM' || authUser.role === 'Insurer' || authUser.role === 'Reseller') {
            const machineCheck = await query('SELECT id FROM machines WHERE id = $1 AND owner_user_id = $2', [id, authUser.id]);
            if (machineCheck.length === 0) {
                return NextResponse.json({ error: 'Not Found', message: 'Machine not found in your fleet' } as ApiError, { status: 404 });
            }
        }

        const body = await request.json();
        const { event_type, notes } = body;

        const validTypes = ['enrolled', 'tested', 'retired', 'repaired', 'transferred', 'decommissioned'];
        if (!event_type || !validTypes.includes(event_type)) {
            return NextResponse.json({
                error: 'Validation Error',
                message: `event_type must be one of: ${validTypes.join(', ')}`
            } as ApiError, { status: 400 });
        }

        const result = await query(
            `INSERT INTO machine_lifecycle_events (machine_id, event_type, notes, recorded_by)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [id, event_type, notes || null, authUser.id]
        );

        return NextResponse.json({
            message: 'Lifecycle event recorded',
            event: result[0],
        }, { status: 201 });
    } catch (error) {
        console.error('Lifecycle POST error:', error);
        return NextResponse.json({ error: 'Server Error', message: 'Failed to add lifecycle event' } as ApiError, { status: 500 });
    }
}
