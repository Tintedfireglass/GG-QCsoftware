import { withAuth, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { updateCustomerSchema } from '@/lib/shared/domain/schemas/customer';
import { getCustomerDetail, updateCustomer, deleteCustomer } from '@/lib/shared/services/customer.service';

// GET /api/admin/customers/[id] — profile + orders, licenses, support tickets
export const GET = withAuth(['SuperAdmin'], async (_request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return json({ error: 'Invalid customer ID' }, { status: 400 });
    return json(await getCustomerDetail(id));
});

// PATCH /api/admin/customers/[id] — edit profile and/or activate/deactivate
export const PATCH = withAuth(['SuperAdmin'], async (request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return json({ error: 'Invalid customer ID' }, { status: 400 });
    const body = await parseBody(request, updateCustomerSchema);
    return json(await updateCustomer(id, body));
});

// DELETE /api/admin/customers/[id] — hard-delete customer + all dependent records
export const DELETE = withAuth(['SuperAdmin'], async (_request, { params }) => {
    const id = parseInt(params.id);
    if (isNaN(id)) return json({ error: 'Invalid customer ID' }, { status: 400 });
    return json(await deleteCustomer(id));
});
