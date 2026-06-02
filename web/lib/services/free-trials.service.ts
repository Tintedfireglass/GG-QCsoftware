import * as repo from '@/lib/repositories/free-trials.repo';

export async function listFreeTrials() {
    return { trials: await repo.listAllFreeTrials() };
}
