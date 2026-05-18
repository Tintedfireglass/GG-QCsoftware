import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';
import { ApiError } from '@/lib/types';

type ServerHealthStatus = 'ok' | 'degraded' | 'critical' | 'unknown';

function isStatus(v: unknown): v is ServerHealthStatus {
    return v === 'ok' || v === 'degraded' || v === 'critical' || v === 'unknown';
}

function normalizeStatus(checks: any[], overall?: unknown): ServerHealthStatus {
    if (isStatus(overall)) return overall;
    const statuses = checks.map(c => c?.status).filter(isStatus) as ServerHealthStatus[];
    if (statuses.includes('critical')) return 'critical';
    if (statuses.includes('degraded')) return 'degraded';
    if (statuses.includes('unknown')) return 'unknown';
    return 'ok';
}

// POST /api/server-health - Submit server health report (device token / JWT)
export async function POST(request: NextRequest) {
    try {
        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError) return authError;
        if (!authUser) {
            return NextResponse.json(
                { error: 'Authentication Error', message: 'Not authenticated' } as ApiError,
                { status: 401 }
            );
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Invalid JSON payload' } as ApiError,
                { status: 400 }
            );
        }

        const schemaVersion = typeof (body as any).schema_version === 'string' ? (body as any).schema_version.trim() : '';
        const agentVersion = typeof (body as any).agent_version === 'string' ? (body as any).agent_version.trim() : null;
        const collectedAtRaw = (body as any).collected_at;
        const checks = Array.isArray((body as any).checks) ? (body as any).checks : [];
        const overallStatus = normalizeStatus(checks, (body as any).overall_status);

        if (!schemaVersion) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'schema_version is required' } as ApiError,
                { status: 400 }
            );
        }

        // Prefer machineId from license device token.
        const machineIdFromToken = typeof (authUser as any).machineId === 'number' ? (authUser as any).machineId : null;
        const machineIdFromBody = typeof (body as any).machine_id === 'number' ? (body as any).machine_id : null;
        const machineId = machineIdFromToken ?? machineIdFromBody;

        if (!machineId || !Number.isFinite(machineId)) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'machine_id is required (or must be present in token)' } as ApiError,
                { status: 400 }
            );
        }

        let collectedAt: Date | null = null;
        if (typeof collectedAtRaw === 'string' && collectedAtRaw.trim()) {
            const d = new Date(collectedAtRaw);
            if (!Number.isNaN(d.getTime())) collectedAt = d;
        }

        // Basic payload size check (~256KB). Request size can be larger; this protects DB/storage.
        const payloadString = JSON.stringify(body);
        if (payloadString.length > 256_000) {
            return NextResponse.json(
                { error: 'Payload Too Large', message: 'Report exceeds 256KB limit; truncate details/raw fields' } as ApiError,
                { status: 413 }
            );
        }

        // Ensure machine exists
        const machines = await query('SELECT id FROM machines WHERE id = $1', [machineId]);
        if (machines.length === 0) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Machine not found' } as ApiError,
                { status: 404 }
            );
        }

        // Update last_seen and store report
        await query('UPDATE machines SET last_seen = NOW() WHERE id = $1', [machineId]);
        const inserted = await query(
            `INSERT INTO machine_health_reports (machine_id, status, collected_at, agent_version, report_json)
             VALUES ($1, $2, $3, $4, $5::jsonb)
             RETURNING id, created_at`,
            [machineId, overallStatus, collectedAt, agentVersion, payloadString]
        );

        return NextResponse.json(
            {
                message: 'Server health report stored',
                id: inserted[0]?.id,
                status: overallStatus,
                created_at: inserted[0]?.created_at,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Server health submit error:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'Failed to store server health report' } as ApiError,
            { status: 500 }
        );
    }
}

