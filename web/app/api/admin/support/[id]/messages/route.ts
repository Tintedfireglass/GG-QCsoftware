import { withAuth, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { ticketMessageSchema } from '@/lib/shared/domain/schemas/support';
import { listTicketMessages, addAdminReply } from '@/lib/shared/services/support.service';

// GET /api/admin/support/[id]/messages — conversation thread for a ticket.
export const GET = withAuth(['SuperAdmin'], async (_request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return json({ error: 'Invalid ticket ID' }, { status: 400 });
    return json(await listTicketMessages(id));
});

// POST /api/admin/support/[id]/messages — send a reply to the customer.
export const POST = withAuth(['SuperAdmin'], async (request, { user, params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return json({ error: 'Invalid ticket ID' }, { status: 400 });
    const body = await parseBody(request, ticketMessageSchema);
    return json(await addAdminReply(id, user.id, body), { status: 201 });
});
