import { withAuth, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { updateTicketSchema } from '@/lib/shared/domain/schemas/support';
import { updateTicket, removeTicket } from '@/lib/shared/services/support.service';

// PATCH /api/admin/support/[id] — update status / priority / admin note.
export const PATCH = withAuth(['SuperAdmin'], async (request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return json({ error: 'Invalid ticket ID' }, { status: 400 });
    const body = await parseBody(request, updateTicketSchema);
    return json(await updateTicket(id, body));
});

// DELETE /api/admin/support/[id] — remove a ticket.
export const DELETE = withAuth(['SuperAdmin'], async (_request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return json({ error: 'Invalid ticket ID' }, { status: 400 });
    return json(await removeTicket(id));
});
