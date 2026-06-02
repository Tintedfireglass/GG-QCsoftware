import { AuthenticatedUser } from '@/lib/auth-middleware';
import { ValidationError, NotFoundError, AppError } from '@/lib/http/errors';
import * as repo from '@/lib/repositories/server-health.repo';

type ServerHealthStatus = 'ok' | 'degraded' | 'critical' | 'unknown';

function isStatus(v: unknown): v is ServerHealthStatus {
    return v === 'ok' || v === 'degraded' || v === 'critical' || v === 'unknown';
}

function normalizeStatus(checks: unknown[], overall?: unknown): ServerHealthStatus {
    if (isStatus(overall)) return overall;
    const statuses = checks.map((c) => (c as { status?: unknown })?.status).filter(isStatus) as ServerHealthStatus[];
    if (statuses.includes('critical')) return 'critical';
    if (statuses.includes('degraded')) return 'degraded';
    if (statuses.includes('unknown')) return 'unknown';
    return 'ok';
}

export async function submitServerHealth(authUser: AuthenticatedUser, body: unknown) {
    if (!body || typeof body !== 'object') {
        throw new ValidationError('Invalid JSON payload');
    }
    const b = body as Record<string, unknown>;

    const schemaVersion = typeof b.schema_version === 'string' ? b.schema_version.trim() : '';
    const agentVersion = typeof b.agent_version === 'string' ? b.agent_version.trim() : null;
    const checks = Array.isArray(b.checks) ? b.checks : [];
    const overallStatus = normalizeStatus(checks, b.overall_status);

    if (!schemaVersion) throw new ValidationError('schema_version is required');

    // Prefer machineId from the license device token.
    const machineIdFromToken = typeof authUser.machineId === 'number' ? authUser.machineId : null;
    const machineIdFromBody = typeof b.machine_id === 'number' ? b.machine_id : null;
    const machineId = machineIdFromToken ?? machineIdFromBody;
    if (!machineId || !Number.isFinite(machineId)) {
        throw new ValidationError('machine_id is required (or must be present in token)');
    }

    let collectedAt: Date | null = null;
    if (typeof b.collected_at === 'string' && b.collected_at.trim()) {
        const d = new Date(b.collected_at);
        if (!Number.isNaN(d.getTime())) collectedAt = d;
    }

    // ~256KB cap protects DB/storage (request body itself may be larger).
    const payloadString = JSON.stringify(b);
    if (payloadString.length > 256_000) {
        throw new AppError(413, 'Payload Too Large', 'Report exceeds 256KB limit; truncate details/raw fields');
    }

    if (!(await repo.machineExists(machineId))) throw new NotFoundError('Machine not found');

    await repo.touchMachine(machineId);
    const inserted = await repo.insertHealthReport({
        machineId,
        status: overallStatus,
        collectedAt,
        agentVersion,
        reportJson: payloadString,
    });

    return {
        message: 'Server health report stored',
        id: inserted?.id,
        status: overallStatus,
        created_at: inserted?.created_at,
    };
}
