import { withAuth, json } from '@/lib/http/handler';
import * as email from '@/lib/shared/services/email-settings.service';

export const GET = withAuth(['SuperAdmin'], async () => {
    return json({ templates: await email.listTemplates() });
});
