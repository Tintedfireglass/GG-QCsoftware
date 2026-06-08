import { ValidationError, NotFoundError } from '@/lib/http/errors';
import { ContactSubmitInput, VALID_CONTACT_STATUSES } from '@/lib/shared/domain/schemas/contact';
import * as repo from '@/lib/shared/repositories/contact.repo';
import { hashIp } from '@/lib/shared/analytics/parse';

export interface SubmitContext {
    ip: string | null;
    userAgent: string | null;
}

// The form notes "Links and scripts are not allowed" — reject obvious spam.
const SPAM_RE = /(https?:\/\/|www\.|<\s*script|<\s*a\s|\[url)/i;

export async function submitContact(input: ContactSubmitInput, ctx: SubmitContext) {
    if (input.description && SPAM_RE.test(input.description)) {
        throw new ValidationError('Links and scripts are not allowed in the description');
    }

    const id = await repo.insertSubmission({
        name: input.name,
        companyName: input.company_name?.trim() || null,
        phone: input.phone_no?.trim() || null,
        email: input.email_id.trim().toLowerCase(),
        service: input.service?.trim() || 'PRAMAAN',
        description: input.description?.trim() || null,
        ipHash: hashIp(ctx.ip),
        userAgent: ctx.userAgent,
    });
    return { ok: true, id };
}

// ── Admin ──

export async function listContacts(q: { status?: string; page?: number; limit?: number }) {
    const limit = Math.min(Math.max(q.limit ?? 20, 1), 100);
    const page = Math.max(q.page ?? 1, 1);
    const offset = (page - 1) * limit;
    const status = q.status && (VALID_CONTACT_STATUSES as readonly string[]).includes(q.status) ? q.status : undefined;

    const [contacts, total, newCount] = await Promise.all([
        repo.listSubmissions({ status, limit, offset }),
        repo.countSubmissions(status),
        repo.countNew(),
    ]);
    return {
        contacts,
        newCount,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
}

export async function setContactStatus(id: number, status: string) {
    const ok = await repo.updateStatus(id, status);
    if (!ok) throw new NotFoundError('Submission not found');
    return { message: 'Status updated' };
}

export async function removeContact(id: number) {
    const ok = await repo.deleteSubmission(id);
    if (!ok) throw new NotFoundError('Submission not found');
    return { message: 'Submission deleted' };
}
