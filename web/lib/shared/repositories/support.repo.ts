import { sql } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';

const { supportTickets, supportTicketMessages } = schema;

export interface NewTicket {
    ticketId: string;
    customerUserId: number;
    subject: string;
    category: string | null;
    message: string;
    deviceId: string | null;
    appVersion: string | null;
    submissionIp: string | null;
}

export async function insertTicket(t: NewTicket): Promise<{ id: number; created_at: string }> {
    const rows = await db
        .insert(supportTickets)
        .values({
            ticketId: t.ticketId,
            customerUserId: t.customerUserId,
            subject: t.subject,
            category: t.category,
            message: t.message,
            deviceId: t.deviceId,
            appVersion: t.appVersion,
            submissionIp: t.submissionIp,
        })
        .returning({ id: supportTickets.id, created_at: supportTickets.createdAt });
    return rows[0];
}

// ── Customer (own tickets) ──────────────────────────────────────────────────────
export async function listForCustomer(
    customerId: number,
    p: { limit: number; offset: number }
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const { rows } = await db.execute(sql`
        SELECT ticket_id, subject, category, message, status, priority, created_at, updated_at,
               (SELECT COUNT(*)::int FROM support_ticket_messages m WHERE m.ticket_id = support_tickets.id) AS message_count
        FROM support_tickets
        WHERE customer_user_id = ${customerId}
        ORDER BY created_at DESC
        LIMIT ${p.limit} OFFSET ${p.offset}`);
    const countRes = await db.execute(sql`SELECT COUNT(*)::int AS n FROM support_tickets WHERE customer_user_id = ${customerId}`);
    const total = Number((countRes.rows[0] as { n: number })?.n ?? 0);
    return { rows: rows as Record<string, unknown>[], total };
}

// ── Admin inbox ─────────────────────────────────────────────────────────────────
export async function listForAdmin(p: {
    status?: string;
    search?: string;
    limit: number;
    offset: number;
}): Promise<Record<string, unknown>[]> {
    const conds = [sql`1 = 1`];
    if (p.status) conds.push(sql`st.status = ${p.status}`);
    if (p.search) {
        const like = `%${p.search}%`;
        conds.push(sql`(st.subject ILIKE ${like} OR st.message ILIKE ${like} OR st.ticket_id ILIKE ${like}
            OR cu.phone ILIKE ${like} OR cu.email ILIKE ${like}
            OR cu.full_name ILIKE ${like} OR cu.first_name ILIKE ${like} OR cu.last_name ILIKE ${like})`);
    }
    const where = sql.join(conds, sql` AND `);
    const { rows } = await db.execute(sql`
        SELECT st.id, st.ticket_id, st.customer_user_id, st.subject, st.category, st.message,
               st.device_id, st.app_version, st.status, st.priority, st.admin_note,
               st.created_at, st.updated_at,
               cu.full_name, cu.first_name, cu.last_name, cu.phone, cu.email
        FROM support_tickets st
        LEFT JOIN customer_users cu ON cu.id = st.customer_user_id
        WHERE ${where}
        ORDER BY st.created_at DESC
        LIMIT ${p.limit} OFFSET ${p.offset}`);
    return rows as Record<string, unknown>[];
}

export async function countByStatus(status?: string): Promise<number> {
    const where = status ? sql`WHERE status = ${status}` : sql``;
    const { rows } = await db.execute(sql`SELECT COUNT(*)::int AS n FROM support_tickets ${where}`);
    return Number((rows[0] as { n: number })?.n ?? 0);
}

export async function updateTicket(
    id: number,
    fields: { status?: string; priority?: string; adminNote?: string | null }
): Promise<boolean> {
    const sets = [sql`updated_at = CURRENT_TIMESTAMP`];
    if (fields.status !== undefined) sets.push(sql`status = ${fields.status}`);
    if (fields.priority !== undefined) sets.push(sql`priority = ${fields.priority}`);
    if (fields.adminNote !== undefined) sets.push(sql`admin_note = ${fields.adminNote}`);
    const { rows } = await db.execute(sql`
        UPDATE support_tickets SET ${sql.join(sets, sql`, `)} WHERE id = ${id} RETURNING id`);
    return rows.length > 0;
}

export async function deleteTicket(id: number): Promise<boolean> {
    await db.execute(sql`DELETE FROM support_ticket_messages WHERE ticket_id = ${id}`);
    const { rows } = await db.execute(sql`DELETE FROM support_tickets WHERE id = ${id} RETURNING id`);
    return rows.length > 0;
}

// ── Conversation messages ───────────────────────────────────────────────────────
export async function getTicketById(id: number): Promise<Record<string, unknown> | null> {
    const { rows } = await db.execute(sql`
        SELECT id, ticket_id, customer_user_id, status FROM support_tickets WHERE id = ${id}`);
    return (rows[0] as Record<string, unknown>) ?? null;
}

export async function getTicketForCustomer(ticketId: string, customerId: number): Promise<Record<string, unknown> | null> {
    const { rows } = await db.execute(sql`
        SELECT id, ticket_id, status FROM support_tickets
        WHERE ticket_id = ${ticketId} AND customer_user_id = ${customerId}`);
    return (rows[0] as Record<string, unknown>) ?? null;
}

export async function listMessages(ticketDbId: number): Promise<Record<string, unknown>[]> {
    const { rows } = await db.execute(sql`
        SELECT id, sender, sender_admin_id, body, created_at
        FROM support_ticket_messages
        WHERE ticket_id = ${ticketDbId}
        ORDER BY created_at ASC, id ASC`);
    return rows as Record<string, unknown>[];
}

export async function insertMessage(m: {
    ticketDbId: number;
    sender: 'admin' | 'customer';
    senderAdminId: number | null;
    body: string;
}): Promise<{ id: number; created_at: string }> {
    const rows = await db
        .insert(supportTicketMessages)
        .values({
            ticketId: m.ticketDbId,
            sender: m.sender,
            senderAdminId: m.senderAdminId,
            body: m.body,
        })
        .returning({ id: supportTicketMessages.id, created_at: supportTicketMessages.createdAt });
    await db.execute(sql`UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ${m.ticketDbId}`);
    return rows[0];
}
