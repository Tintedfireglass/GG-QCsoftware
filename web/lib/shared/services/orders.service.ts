import { NotFoundError } from '@/lib/http/errors';
import * as repo from '@/lib/shared/repositories/orders.repo';

const VALID_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

export async function listOrders(q: { status?: string; search?: string; page?: number; limit?: number }) {
    const limit = Math.min(Math.max(q.limit ?? 20, 1), 100);
    const page = Math.max(q.page ?? 1, 1);
    const offset = (page - 1) * limit;
    const status = q.status && VALID_STATUSES.includes(q.status) ? q.status : undefined;
    const search = q.search?.trim() || undefined;

    const [orders, total] = await Promise.all([
        repo.listOrdersAdmin({ status, search, limit, offset }),
        repo.countOrdersAdmin({ status, search }),
    ]);
    return { orders, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

export async function getOrder(id: number) {
    const order = await repo.getOrderDetailAdmin(id);
    if (!order) throw new NotFoundError('Order not found');
    return { order };
}
