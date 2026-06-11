import { mobileWrap, mobileOk, parseMobileBody } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';
import { supportMessageSchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { listMyTicketMessages, replyToTicket } from '@/lib/platforms/android/services/mobile-support.service';

// GET /api/mobile/support/tickets/[ticketId]/messages — conversation on the customer's own ticket.
export const GET = mobileWrap(async (request, { params }) => {
    const { customerId } = requireCustomer(request);
    const r = await listMyTicketMessages(customerId, params.ticketId);
    return mobileOk({ data: r.data });
});

// POST /api/mobile/support/tickets/[ticketId]/messages — customer sends a message.
export const POST = mobileWrap(async (request, { params }) => {
    const { customerId } = requireCustomer(request);
    const body = await parseMobileBody(request, supportMessageSchema);
    const r = await replyToTicket(customerId, params.ticketId, body);
    return mobileOk({ data: r.data, message: 'Message sent', status: 201 });
});
