import { db } from '@/lib/drizzle';
import { smsProviders } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';

export async function getActiveSmsProvider() {
    const [row] = await db.select().from(smsProviders).where(eq(smsProviders.isActive, true)).limit(1);
    return row || null;
}

export async function getAllProviders() {
    return db.select().from(smsProviders);
}

export async function getProviderById(id: number) {
    const [row] = await db.select().from(smsProviders).where(eq(smsProviders.id, id)).limit(1);
    return row || null;
}

export async function upsertProvider(provider: string, config: Record<string, unknown>, isActive: boolean) {
    const [existing] = await db.select().from(smsProviders).where(eq(smsProviders.provider, provider)).limit(1);
    if (existing) {
        const [updated] = await db
            .update(smsProviders)
            .set({ config, isActive, updatedAt: new Date().toISOString() })
            .where(eq(smsProviders.id, existing.id))
            .returning();
        return updated;
    }
    const [inserted] = await db.insert(smsProviders).values({ provider, config, isActive }).returning();
    return inserted;
}

/** Mark one provider active and deactivate all others. */
export async function setActiveProvider(id: number) {
    await db.update(smsProviders).set({ isActive: false });
    const [updated] = await db
        .update(smsProviders)
        .set({ isActive: true, updatedAt: new Date().toISOString() })
        .where(eq(smsProviders.id, id))
        .returning();
    return updated;
}

export async function deleteProvider(id: number) {
    await db.delete(smsProviders).where(eq(smsProviders.id, id));
}
