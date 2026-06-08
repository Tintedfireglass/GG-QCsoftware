import { desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';

const { contactSubmissions } = schema;

export interface NewContact {
    name: string;
    companyName: string | null;
    phone: string | null;
    email: string;
    service: string | null;
    description: string | null;
    ipHash: string | null;
    userAgent: string | null;
}

export async function insertSubmission(c: NewContact): Promise<number> {
    const rows = await db.insert(contactSubmissions).values({
        name: c.name,
        companyName: c.companyName,
        phone: c.phone,
        email: c.email,
        service: c.service ?? 'PRAMAAN',
        description: c.description,
        ipHash: c.ipHash,
        userAgent: c.userAgent,
    }).returning({ id: contactSubmissions.id });
    return rows[0].id;
}

const contactColumns = {
    id: contactSubmissions.id,
    name: contactSubmissions.name,
    company_name: contactSubmissions.companyName,
    phone: contactSubmissions.phone,
    email: contactSubmissions.email,
    service: contactSubmissions.service,
    description: contactSubmissions.description,
    source: contactSubmissions.source,
    status: contactSubmissions.status,
    created_at: contactSubmissions.createdAt,
};

export async function listSubmissions(p: { status?: string; limit: number; offset: number }): Promise<Record<string, unknown>[]> {
    const q = db.select(contactColumns).from(contactSubmissions)
        .orderBy(desc(contactSubmissions.createdAt))
        .limit(p.limit).offset(p.offset);
    const rows = p.status ? await q.where(eq(contactSubmissions.status, p.status)) : await q;
    return rows as Record<string, unknown>[];
}

export async function countSubmissions(status?: string): Promise<number> {
    const base = db.select({ n: sql<number>`count(*)::int` }).from(contactSubmissions);
    const rows = status ? await base.where(eq(contactSubmissions.status, status)) : await base;
    return rows[0]?.n ?? 0;
}

export async function countNew(): Promise<number> {
    return countSubmissions('new');
}

export async function updateStatus(id: number, status: string): Promise<boolean> {
    const rows = await db.update(contactSubmissions).set({ status })
        .where(eq(contactSubmissions.id, id)).returning({ id: contactSubmissions.id });
    return rows.length > 0;
}

export async function deleteSubmission(id: number): Promise<boolean> {
    const rows = await db.delete(contactSubmissions).where(eq(contactSubmissions.id, id)).returning({ id: contactSubmissions.id });
    return rows.length > 0;
}
