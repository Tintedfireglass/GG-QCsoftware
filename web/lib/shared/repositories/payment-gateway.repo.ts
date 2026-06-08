import { db } from '@/lib/drizzle';
import { paymentGateways, paymentWebhookEvents } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';

export async function getActiveGateway() {
    const [gateway] = await db
        .select()
        .from(paymentGateways)
        .where(eq(paymentGateways.isActive, true))
        .limit(1);
    return gateway || null;
}

export async function getAllGateways() {
    return db.select().from(paymentGateways);
}

export async function upsertGateway(provider: string, config: Record<string, any>, isActive: boolean) {
    const [existing] = await db
        .select()
        .from(paymentGateways)
        .where(eq(paymentGateways.provider, provider))
        .limit(1);

    if (existing) {
        const [updated] = await db
            .update(paymentGateways)
            .set({ config, isActive, updatedAt: new Date().toISOString() })
            .where(eq(paymentGateways.id, existing.id))
            .returning();
        return updated;
    }

    const [inserted] = await db
        .insert(paymentGateways)
        .values({ provider, config, isActive })
        .returning();
    return inserted;
}

export async function setActiveGateway(id: number) {
    await db.update(paymentGateways).set({ isActive: false });
    const [updated] = await db
        .update(paymentGateways)
        .set({ isActive: true, updatedAt: new Date().toISOString() })
        .where(eq(paymentGateways.id, id))
        .returning();
    return updated;
}

export async function deleteGateway(id: number) {
    await db.delete(paymentGateways).where(eq(paymentGateways.id, id));
}

/** Record a webhook event for idempotency. Returns true if it is new (first
 *  time seen), false if it was already processed (duplicate/replay). */
export async function recordWebhookEvent(provider: string, eventId: string, eventType: string | null): Promise<boolean> {
    const inserted = await db
        .insert(paymentWebhookEvents)
        .values({ provider, eventId, eventType })
        .onConflictDoNothing({ target: [paymentWebhookEvents.provider, paymentWebhookEvents.eventId] })
        .returning({ id: paymentWebhookEvents.id });
    return inserted.length > 0;
}
