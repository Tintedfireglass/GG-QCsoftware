import { withAuth, json } from '@/lib/http/handler';
import * as email from '@/lib/shared/services/email-settings.service';

export const GET = withAuth(['SuperAdmin'], async (_request, { params }) => {
    return json({ template: await email.getTemplate(params.key) });
});

export const PUT = withAuth(['SuperAdmin'], async (request, { params }) => {
    const body = await request.json();
    const template = await email.updateTemplate(params.key, {
        subject: body?.subject,
        html: body?.html,
        text: body?.text,
    });
    return json({ template });
});

// Reset to the code default by removing the saved override.
export const DELETE = withAuth(['SuperAdmin'], async (_request, { params }) => {
    return json({ template: await email.resetTemplate(params.key) });
});
