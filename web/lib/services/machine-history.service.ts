import { db } from '@/lib/drizzle';
import { ValidationError, ForbiddenError } from '@/lib/http/errors';
import { SubmitMachineHistoryInput, AlertsQuery } from '@/lib/domain/schemas/machine-history';
import * as repo from '@/lib/repositories/machine-history.repo';

export async function submitMachineHistory(authUserId: number, body: SubmitMachineHistoryInput) {
    if (!body.machineId || !body.source || !body.componentGrades || typeof body.componentGrades !== 'object') {
        throw new ValidationError('Missing required fields');
    }
    const machineIdRaw = body.machineId.trim();
    if (!machineIdRaw) throw new ValidationError('Missing machine identifier');

    const id = await db.transaction(async (tx) => {
        const license = await repo.findActivation(tx, machineIdRaw);
        if (!license) throw new ForbiddenError('This machine is not activated with a license key');
        if (!license.is_active) throw new ForbiddenError('The license key for this machine has been disabled');
        if (license.expires_at && new Date(license.expires_at) < new Date()) {
            throw new ForbiddenError('The license key for this machine has expired');
        }

        const machineDbId = await repo.findOrCreateMachine(tx, machineIdRaw);
        return repo.insertMachineHistory(tx, {
            machineId: machineDbId,
            timestamp: (body.timestamp ? new Date(body.timestamp) : new Date()).toISOString(),
            source: body.source!,
            componentGrades: body.componentGrades,
            createdBy: authUserId,
            appVersion: body.appVersion || null,
        });
    });

    return { message: 'Machine history submitted successfully', id };
}

// ── Alerts: detect component grade regressions between the last two reports ──

const GRADE_RANK: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
const COMPONENT_LABELS: Record<string, string> = {
    cpu: 'CPU', ram: 'RAM', storage: 'Storage', battery: 'Battery', smart: 'SMART',
};

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(n, max));
}

function asGrades(value: unknown): Record<string, { grade?: string }> {
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return {}; }
    }
    return (value as Record<string, { grade?: string }>) || {};
}

export async function machineHistoryAlerts(user: import('@/lib/auth-middleware').AuthenticatedUser, q: AlertsQuery) {
    const recentDays = clamp(parseInt(q.recentDays || '30', 10) || 30, 1, 365);
    const limit = clamp(parseInt(q.limit || '10', 10) || 10, 1, 50);

    const rows = await repo.listRecentHistoryPairs(user, recentDays);

    const grouped = new Map<number, { latest?: Record<string, unknown>; previous?: Record<string, unknown> }>();
    for (const row of rows) {
        const machineId = row.machine_id as number;
        const entry = grouped.get(machineId) || {};
        if (row.rn === 1) entry.latest = row;
        if (row.rn === 2) entry.previous = row;
        grouped.set(machineId, entry);
    }

    const alerts: Record<string, unknown>[] = [];
    for (const [machineId, entry] of grouped.entries()) {
        const { latest, previous } = entry;
        if (!latest || !previous) continue;

        const latestGrades = asGrades(latest.component_grades);
        const previousGrades = asGrades(previous.component_grades);

        const daysDiff = Math.abs(new Date(latest.timestamp as string).getTime() - new Date(previous.timestamp as string).getTime()) / (1000 * 60 * 60 * 24);
        if (Number.isNaN(daysDiff) || daysDiff > 30) continue;

        for (const key of Object.keys(latestGrades)) {
            const latestGrade = (latestGrades[key]?.grade || '').toUpperCase();
            const previousGrade = (previousGrades[key]?.grade || '').toUpperCase();
            if (!latestGrade || !previousGrade) continue;
            if (GRADE_RANK[previousGrade] > GRADE_RANK[latestGrade]) {
                alerts.push({
                    machine_id: machineId,
                    machine_identifier: latest.machine_identifier,
                    custom_name: latest.custom_name,
                    component: COMPONENT_LABELS[key] || key.toUpperCase(),
                    previous_grade: previousGrade,
                    latest_grade: latestGrade,
                    latest_timestamp: latest.timestamp,
                });
            }
        }
    }

    alerts.sort((a, b) => (Date.parse((b.latest_timestamp as string) || '') || 0) - (Date.parse((a.latest_timestamp as string) || '') || 0));
    return { alerts: alerts.slice(0, limit) };
}
