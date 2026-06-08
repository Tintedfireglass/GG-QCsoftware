import { withAuth, json } from '@/lib/http/handler';
import * as email from '@/lib/shared/services/email-settings.service';

// Render an (optionally unsaved) draft against sample data for live preview.
export const POST = withAuth(['SuperAdmin'], async (request, { params }) => {
    const body = await request.json().catch(() => ({}));
    const preview = await email.previewTemplate(params.key, {
        subject: body?.subject,
        html: body?.html,
        text: body?.text,
    });
    return json({ preview });
});
