import { db } from '@/lib/drizzle';
import { emailTemplates } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';

export type EmailTemplateRow = typeof emailTemplates.$inferSelect;

/** All saved template overrides (rows that exist mean the default was customized). */
export async function getAllTemplates(): Promise<EmailTemplateRow[]> {
    return db.select().from(emailTemplates);
}

export async function getTemplate(key: string): Promise<EmailTemplateRow | null> {
    const [row] = await db.select().from(emailTemplates).where(eq(emailTemplates.key, key)).limit(1);
    return row || null;
}

export async function upsertTemplate(input: {
    key: string;
    name: string;
    subject: string;
    html: string;
    text: string;
}): Promise<EmailTemplateRow> {
    const [row] = await db
        .insert(emailTemplates)
        .values(input)
        .onConflictDoUpdate({
            target: emailTemplates.key,
            set: {
                name: input.name,
                subject: input.subject,
                html: input.html,
                text: input.text,
                updatedAt: new Date().toISOString(),
            },
        })
        .returning();
    return row;
}

/** Remove a customization, reverting that template to its code default. */
export async function deleteTemplate(key: string) {
    await db.delete(emailTemplates).where(eq(emailTemplates.key, key));
}
