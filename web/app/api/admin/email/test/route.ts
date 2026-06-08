import { withAuth, json } from '@/lib/http/handler';
import * as email from '@/lib/shared/services/email-settings.service';

export const POST = withAuth(['SuperAdmin'], async (request) => {
    const body = await request.json().catch(() => ({}));
    const to = typeof body?.to === 'string' ? body.to.trim() : '';
    const sent = await email.sendTestEmail(to);
    if (!sent) {
        return json({ error: 'No active email provider is configured, or the send failed. Check your provider settings.' }, { status: 400 });
    }
    return json({ success: true });
});
