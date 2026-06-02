import { AuthenticatedUser } from '@/lib/auth-middleware';
import { ValidationError, NotFoundError } from '@/lib/http/errors';
import { FleetEnrollInput, LifecycleEventInput } from '@/lib/domain/schemas/fleet';
import * as repo from '@/lib/repositories/fleet.repo';

const FLEET_OWNER_ROLES = ['Enterprise', 'OEM', 'Insurer', 'Reseller'];
const VALID_EVENT_TYPES = ['enrolled', 'tested', 'retired', 'repaired', 'transferred', 'decommissioned'];

function parseMachineId(machineId: string): number {
    const id = parseInt(machineId, 10);
    if (Number.isNaN(id)) throw new ValidationError('Invalid machine ID');
    return id;
}

async function assertFleetAccess(user: AuthenticatedUser, machineId: number): Promise<void> {
    if (FLEET_OWNER_ROLES.includes(user.role) && !(await repo.isOwnedBy(user, machineId))) {
        throw new NotFoundError('Machine not found in your fleet');
    }
}

export async function listFleet(user: AuthenticatedUser, q: { group_id?: number; search?: string }) {
    const machines = await repo.listFleet(user, { groupId: q.group_id, search: q.search });
    const total = machines.length;
    const tested = machines.filter((m) => m.latest_score !== null && m.latest_score !== undefined).length;
    const avgScore = tested > 0
        ? Math.round(machines.reduce((sum, m) => sum + (Number(m.latest_score) || 0), 0) / tested)
        : 0;
    return { machines, summary: { total, tested, untested: total - tested, avgScore } };
}

export async function enrollMachine(user: AuthenticatedUser, body: FleetEnrollInput) {
    if (!body.machine_id) throw new ValidationError('machine_id is required');
    const machineId = await repo.enrollMachine({
        machineId: body.machine_id,
        assetTag: body.asset_tag ?? null,
        groupId: body.group_id ?? null,
        serialNumber: body.serial_number ?? null,
        manufacturer: body.manufacturer ?? null,
        model: body.model ?? null,
        ownerId: user.id,
        recordedByUsername: user.username,
    });
    return { message: 'Machine enrolled in fleet', machine_id: machineId };
}

export async function getLifecycle(user: AuthenticatedUser, machineIdStr: string) {
    const id = parseMachineId(machineIdStr);
    await assertFleetAccess(user, id);
    return { events: await repo.listLifecycle(id) };
}

export async function addLifecycleEvent(user: AuthenticatedUser, machineIdStr: string, body: LifecycleEventInput) {
    const id = parseMachineId(machineIdStr);
    await assertFleetAccess(user, id);
    if (!body.event_type || !VALID_EVENT_TYPES.includes(body.event_type)) {
        throw new ValidationError(`event_type must be one of: ${VALID_EVENT_TYPES.join(', ')}`);
    }
    const event = await repo.addLifecycleEvent(id, body.event_type, body.notes ?? null, user.id);
    return { message: 'Lifecycle event recorded', event };
}
