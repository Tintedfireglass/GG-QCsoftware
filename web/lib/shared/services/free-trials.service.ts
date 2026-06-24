import * as repo from '@/lib/shared/repositories/free-trials.repo';

export async function listFreeTrials(q: { search?: string; page?: number; limit?: number } = {}) {
    const limit = Math.min(Math.max(q.limit ?? 20, 1), 100);
    const page = Math.max(q.page ?? 1, 1);
    const offset = (page - 1) * limit;
    const search = q.search?.trim() || undefined;

    const [trials, total] = await Promise.all([
        repo.listAllFreeTrials({ search, limit, offset }),
        repo.countFreeTrials({ search }),
    ]);
    return { trials, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}
