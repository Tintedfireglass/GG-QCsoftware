import { AuthenticatedUser } from '@/lib/auth-middleware';
import { NotFoundError } from '@/lib/http/errors';
import * as repo from '@/lib/platforms/windows/repositories/machines.repo';
import type { UpdateMachinePatch } from '@/lib/platforms/windows/domain/schemas/machines';

export async function countMachines(user: AuthenticatedUser, archived?: boolean): Promise<{ total: number }> {
    return { total: await repo.countVisibleMachines(user, archived) };
}

export async function listMachines(
    user: AuthenticatedUser,
    archived?: boolean
): Promise<{ machines: Record<string, unknown>[] }> {
    return { machines: await repo.listMachinesWithStats(user, archived) };
}

/** Parse a route :id param to a positive integer, or 404 (previously a 500). */
function parseMachineId(id: string): number {
    const n = parseInt(id, 10);
    if (!Number.isInteger(n) || n <= 0) throw new NotFoundError('Machine not found');
    return n;
}

export async function getMachineDetails(user: AuthenticatedUser, id: string) {
    const machineId = parseMachineId(id);
    const machine = await repo.findAccessibleMachine(user, machineId);
    if (!machine) throw new NotFoundError('Machine not found');

    const [test_history, machine_history] = await Promise.all([
        repo.listTestHistory(user, id),
        repo.listMachineHistory(user, id),
    ]);
    return { machine, test_history, machine_history };
}

/**
 * Dashboard PATCH: rename and/or archive. Each field is applied only when the
 * caller sent it, so archiving a machine never wipes its custom name.
 */
export async function updateMachine(user: AuthenticatedUser, id: string, patch: UpdateMachinePatch) {
    const machineId = parseMachineId(id);
    if (!(await repo.findAccessibleMachine(user, machineId))) {
        throw new NotFoundError('Machine not found');
    }

    let machine: Awaited<ReturnType<typeof repo.updateMachineCustomName>> | null = null;
    if (patch.customName !== undefined) {
        const trimmed = patch.customName.trim();
        machine = await repo.updateMachineCustomName(machineId, trimmed ? trimmed : null);
    }
    if (patch.archived !== undefined) {
        machine = await repo.setMachineArchived(machineId, patch.archived);
    }
    // Nothing sent: hand back the current row rather than pretending to write.
    if (!machine) machine = await repo.findAccessibleMachine(user, machineId);
    return { machine };
}

export async function renameMachine(user: AuthenticatedUser, id: string, customNameRaw?: string) {
    const machineId = parseMachineId(id);
    // Access check before mutating.
    if (!(await repo.findAccessibleMachine(user, machineId))) {
        throw new NotFoundError('Machine not found');
    }
    const trimmed = customNameRaw?.trim();
    const customName = trimmed ? trimmed : null;
    return { machine: await repo.updateMachineCustomName(machineId, customName) };
}
