import { randomBytes } from 'crypto';
import { z } from 'zod';
import { MobileError } from '@/lib/platforms/android/http';
import * as repo from '@/lib/shared/repositories/support.repo';
import { supportContactSchema, supportListQuerySchema, supportMessageSchema } from '@/lib/platforms/android/domain/schemas/mobile';

interface Ctx {
    customerId: number;
    ip: string | null;
}

function makeTicketId(): string {
    return `tkt_${randomBytes(6).toString('hex')}`;
}

export async function submitTicket(ctx: Ctx, body: z.infer<typeof supportContactSchema>) {
    const ticketId = makeTicketId();
    const saved = await repo.insertTicket({
        ticketId,
        customerUserId: ctx.customerId,
        subject: body.subject,
        category: body.category ?? null,
        message: body.message,
        deviceId: body.deviceId ?? null,
        appVersion: body.appVersion ?? null,
        submissionIp: ctx.ip,
    });
    return { data: { ticketId, status: 'open', createdAt: saved.created_at } };
}

export async function listMyTickets(customerId: number, query: z.infer<typeof supportListQuerySchema>) {
    const offset = (query.page - 1) * query.limit;
    const { rows, total } = await repo.listForCustomer(customerId, { limit: query.limit, offset });
    const tickets = rows.map((r) => ({
        ticketId: r.ticket_id,
        subject: r.subject,
        category: r.category ?? null,
        message: r.message,
        status: r.status,
        priority: r.priority,
        messageCount: Number(r.message_count ?? 0),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    }));
    return {
        data: {
            tickets,
            pagination: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / query.limit)),
            },
        },
    };
}

// ── Conversation (customer ⇄ support) ───────────────────────────────────────────
// sender_admin_id stays internal — the app only sees sender: 'admin' | 'customer'.
export async function listMyTicketMessages(customerId: number, ticketId: string) {
    const ticket = await repo.getTicketForCustomer(ticketId, customerId);
    if (!ticket) throw new MobileError(404, 'NOT_FOUND', 'Ticket not found');
    const rows = await repo.listMessages(Number(ticket.id));
    return {
        data: {
            ticketId,
            status: ticket.status,
            messages: rows.map((r) => ({
                id: r.id,
                sender: r.sender,
                message: r.body,
                createdAt: r.created_at,
            })),
        },
    };
}

export async function replyToTicket(customerId: number, ticketId: string, body: z.infer<typeof supportMessageSchema>) {
    const ticket = await repo.getTicketForCustomer(ticketId, customerId);
    if (!ticket) throw new MobileError(404, 'NOT_FOUND', 'Ticket not found');
    if (ticket.status === 'closed') {
        throw new MobileError(409, 'TICKET_CLOSED', 'This ticket is closed. Please raise a new ticket.');
    }
    const saved = await repo.insertMessage({
        ticketDbId: Number(ticket.id),
        sender: 'customer',
        senderAdminId: null,
        body: body.message,
    });
    return { data: { id: saved.id, ticketId, createdAt: saved.created_at } };
}
