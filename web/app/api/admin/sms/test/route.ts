import { withAuth, json } from '@/lib/http/handler';
import * as sms from '@/lib/shared/services/sms-settings.service';

export const POST = withAuth(['SuperAdmin'], async (request) => {
    const body = await request.json().catch(() => ({}));
    const to = typeof body?.to === 'string' ? body.to.trim() : '';
    const countryCode = typeof body?.countryCode === 'string' ? body.countryCode : undefined;
    const sent = await sms.sendTestSms(to, countryCode);
    if (!sent) {
        return json({ error: 'No active SMS provider is configured, or the send failed. Check your provider settings.' }, { status: 400 });
    }
    return json({ success: true });
});
