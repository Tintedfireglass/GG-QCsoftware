import { AuthenticatedUser } from '@/lib/auth-middleware';
import { NotFoundError } from '@/lib/http/errors';
import * as repo from '@/lib/platforms/windows/repositories/machines.repo';

export async function countMachines(user: AuthenticatedUser): Promise<{ total: number }> {
    return { total: await repo.countVisibleMachines(user) };
}

export async function listMachines(user: AuthenticatedUser): Promise<{ machines: Record<string, unknown>[] }> {
    return { machines: await repo.listMachinesWithStats(user) };
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
