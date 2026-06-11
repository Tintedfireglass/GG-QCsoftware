import { NotFoundError } from '@/lib/http/errors';
import { VALID_TICKET_STATUSES, UpdateTicketInput, TicketMessageInput } from '@/lib/shared/domain/schemas/support';
import * as repo from '@/lib/shared/repositories/support.repo';

function customerName(r: Record<string, unknown>): string | null {
    const first = (r.first_name as string) ?? '';
    const last = (r.last_name as string) ?? '';
    const joined = `${first} ${last}`.trim();
    return joined || (r.full_name as string) || null;
}

function mapRow(r: Record<string, unknown>) {
    return {
        id: r.id,
        ticketId: r.ticket_id,
        subject: r.subject,
        category: r.category ?? null,
        message: r.message,
        deviceId: r.device_id ?? null,
        appVersion: r.app_version ?? null,
        status: r.status,
        priority: r.priority,
        adminNote: r.admin_note ?? null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        customer: {
            id: r.customer_user_id,
            name: customerName(r),
            phone: r.phone ?? null,
            email: r.email ?? null,
        },
    };
}

export async function listTickets(q: { status?: string; search?: string; page?: number; limit?: number }) {
    const limit = Math.min(Math.max(q.limit ?? 20, 1), 100);
    const page = Math.max(q.page ?? 1, 1);
    const offset = (page - 1) * limit;
    const status = q.status && (VALID_TICKET_STATUSES as readonly string[]).includes(q.status) ? q.status : undefined;

    const [rows, total, openCount] = await Promise.all([
        repo.listForAdmin({ status, search: q.search, limit, offset }),
        repo.countByStatus(status),
        repo.countByStatus('open'),
    ]);
    return {
        tickets: rows.map(mapRow),
        openCount,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
}

export async function updateTicket(id: number, input: UpdateTicketInput) {
    const ok = await repo.updateTicket(id, {
        status: input.status,
        priority: input.priority,
        adminNote: input.adminNote === undefined ? undefined : (input.adminNote || null),
    });
    if (!ok) throw new NotFoundError('Ticket not found');
    return { message: 'Ticket updated' };
}

export async function removeTicket(id: number) {
    const ok = await repo.deleteTicket(id);
    if (!ok) throw new NotFoundError('Ticket not found');
    return { message: 'Ticket deleted' };
}

// ── Conversation (admin ⇄ customer) ─────────────────────────────────────────────
function mapMessage(r: Record<string, unknown>) {
    return {
        id: r.id,
        sender: r.sender,
        senderAdminId: r.sender_admin_id ?? null,
        message: r.body,
        createdAt: r.created_at,
    };
}

export async function listTicketMessages(id: number) {
    const ticket = await repo.getTicketById(id);
    if (!ticket) throw new NotFoundError('Ticket not found');
    const rows = await repo.listMessages(id);
    return { messages: rows.map(mapMessage) };
}

export async function addAdminReply(id: number, adminId: number, input: TicketMessageInput) {
    const ticket = await repo.getTicketById(id);
    if (!ticket) throw new NotFoundError('Ticket not found');
    const saved = await repo.insertMessage({
        ticketDbId: id,
        sender: 'admin',
        senderAdminId: adminId,
        body: input.message,
    });
    return { message: 'Reply sent', id: saved.id, createdAt: saved.created_at };
}
