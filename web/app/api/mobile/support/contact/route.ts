import { mobileWrap, mobileOk, parseMobileBody } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';
import { clientIp } from '@/lib/http/handler';
import { supportContactSchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { submitTicket } from '@/lib/platforms/android/services/mobile-support.service';

// POST /api/mobile/support/contact — raise a support ticket from the app.
export const POST = mobileWrap(async (request) => {
    const { customerId } = requireCustomer(request);
    const body = await parseMobileBody(request, supportContactSchema);
    const r = await submitTicket({ customerId, ip: clientIp(request) }, body);
    return mobileOk({ data: r.data, message: 'Support ticket created', status: 201 });
});
