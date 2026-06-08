import { db } from '@/lib/drizzle';
import { emailProviders } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';

export async function getActiveProvider() {
    const [row] = await db
        .select()
        .from(emailProviders)
        .where(eq(emailProviders.isActive, true))
        .limit(1);
    return row || null;
}

export async function getAllProviders() {
    return db.select().from(emailProviders);
}

export async function getProviderById(id: number) {
    const [row] = await db.select().from(emailProviders).where(eq(emailProviders.id, id)).limit(1);
    return row || null;
}

export async function upsertProvider(provider: string, config: Record<string, any>, isActive: boolean) {
    const [existing] = await db
        .select()
        .from(emailProviders)
        .where(eq(emailProviders.provider, provider))
        .limit(1);

    if (existing) {
        const [updated] = await db
            .update(emailProviders)
            .set({ config, isActive, updatedAt: new Date().toISOString() })
            .where(eq(emailProviders.id, existing.id))
            .returning();
        return updated;
    }

    const [inserted] = await db
        .insert(emailProviders)
        .values({ provider, config, isActive })
        .returning();
    return inserted;
}

/** Mark one provider active and deactivate all others. */
export async function setActiveProvider(id: number) {
    await db.update(emailProviders).set({ isActive: false });
    const [updated] = await db
        .update(emailProviders)
        .set({ isActive: true, updatedAt: new Date().toISOString() })
        .where(eq(emailProviders.id, id))
        .returning();
    return updated;
}

export async function deleteProvider(id: number) {
    await db.delete(emailProviders).where(eq(emailProviders.id, id));
}
