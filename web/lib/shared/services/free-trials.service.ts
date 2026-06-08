import * as repo from '@/lib/shared/repositories/free-trials.repo';

export async function listFreeTrials() {
    return { trials: await repo.listAllFreeTrials() };
}
