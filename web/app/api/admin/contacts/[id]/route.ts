import { withAuth, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { updateContactSchema } from '@/lib/shared/domain/schemas/contact';
import { setContactStatus, removeContact } from '@/lib/shared/services/contact.service';

// PATCH /api/admin/contacts/[id] - update triage status
export const PATCH = withAuth(['SuperAdmin'], async (request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return json({ error: 'Invalid submission ID' }, { status: 400 });
    const body = await parseBody(request, updateContactSchema);
    return json(await setContactStatus(id, body.status));
});

// DELETE /api/admin/contacts/[id] - remove a submission
export const DELETE = withAuth(['SuperAdmin'], async (_request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return json({ error: 'Invalid submission ID' }, { status: 400 });
    return json(await removeContact(id));
});
