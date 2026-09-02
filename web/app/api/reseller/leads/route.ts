import { withAuth, json } from '@/lib/http/handler';
import { parseBody } from '@/lib/http/validate';
import { z } from 'zod';
import { db, schema } from '@/lib/drizzle';
import { eq, desc, and, ilike, or, sql } from 'drizzle-orm';
import { ForbiddenError, ValidationError } from '@/lib/http/errors';

const { resellerLeads } = schema;

let tableEnsured = false;
async function ensureLeadsTable() {
    if (tableEnsured) return;
    try {
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS reseller_leads (
                id              SERIAL PRIMARY KEY,
                reseller_id     INTEGER NOT NULL,
                company_name    VARCHAR(255) NOT NULL,
                contact_name    VARCHAR(255),
                contact_email   VARCHAR(255),
                contact_phone   VARCHAR(50),
                notes           TEXT,
                status          VARCHAR(50) NOT NULL DEFAULT 'active'
                                    CONSTRAINT reseller_leads_status_check
                                    CHECK (status IN ('active', 'converted', 'lost', 'expired')),
                created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_reseller_leads_reseller
                ON reseller_leads (reseller_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_reseller_leads_status
                ON reseller_leads (status);
        `);
        tableEnsured = true;
    } catch (e) {
        console.error('Error ensuring reseller_leads table:', e);
    }
}

const createLeadSchema = z.object({
    company_name: z.string().min(1, 'Company name is required').max(255),
    contact_name: z.string().max(255).optional(),
    contact_email: z.string().email().max(255).optional().or(z.literal('')),
    contact_phone: z.string().max(50).optional(),
    notes: z.string().optional(),
    status: z.enum(['active', 'converted', 'lost', 'expired']).default('active'),
});

// GET /api/reseller/leads — list own leads (Reseller) or all leads (SuperAdmin)
export const GET = withAuth(['SuperAdmin', 'Reseller'], async (request, { user }) => {
    await ensureLeadsTable();

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(sp.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;
    const search = sp.get('search')?.trim() || undefined;
    const status = sp.get('status') || undefined;

    // Build where clause
    const conditions = [];

    // Resellers only see their own leads
    if (user.role === 'Reseller') {
        conditions.push(eq(resellerLeads.resellerId, user.id));
    }

    if (status && status !== 'all') {
        conditions.push(eq(resellerLeads.status, status));
    }

    if (search) {
        conditions.push(
            or(
                ilike(resellerLeads.companyName, `%${search}%`),
                ilike(resellerLeads.contactName, `%${search}%`),
                ilike(resellerLeads.contactEmail, `%${search}%`),
            )!
        );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [leads, countResult] = await Promise.all([
        db.select().from(resellerLeads)
            .where(where)
            .orderBy(desc(resellerLeads.createdAt))
            .limit(limit)
            .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(resellerLeads).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return json({
        leads,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
});

// POST /api/reseller/leads — create a new lead
export const POST = withAuth(['Reseller'], async (request, { user }) => {
    await ensureLeadsTable();

    const body = await parseBody(request, createLeadSchema);

    const [lead] = await db.insert(resellerLeads).values({
        resellerId: user.id,
        companyName: body.company_name,
        contactName: body.contact_name || null,
        contactEmail: body.contact_email || null,
        contactPhone: body.contact_phone || null,
        notes: body.notes || null,
        status: body.status,
    }).returning();

    return json({ message: 'Lead registered successfully', lead }, { status: 201 });
});

// PATCH /api/reseller/leads?id=X — update lead status/notes
export const PATCH = withAuth(['Reseller', 'SuperAdmin'], async (request, { user }) => {
    await ensureLeadsTable();

    const sp = request.nextUrl.searchParams;
    const id = parseInt(sp.get('id') || '', 10);
    if (isNaN(id)) throw new ValidationError('Lead ID is required');

    const body = await parseBody(request, createLeadSchema.partial());

    // Verify ownership
    const [existing] = await db.select().from(resellerLeads).where(eq(resellerLeads.id, id)).limit(1);
    if (!existing) throw new ValidationError('Lead not found');
    if (user.role === 'Reseller' && existing.resellerId !== user.id) throw new ForbiddenError('You can only edit your own leads');

    const [updated] = await db.update(resellerLeads)
        .set({
            ...(body.company_name !== undefined && { companyName: body.company_name }),
            ...(body.contact_name !== undefined && { contactName: body.contact_name }),
            ...(body.contact_email !== undefined && { contactEmail: body.contact_email }),
            ...(body.contact_phone !== undefined && { contactPhone: body.contact_phone }),
            ...(body.notes !== undefined && { notes: body.notes }),
            ...(body.status !== undefined && { status: body.status }),
            updatedAt: new Date().toISOString(),
        })
        .where(eq(resellerLeads.id, id))
        .returning();

    return json({ message: 'Lead updated', lead: updated });
});
