import { and, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';
import type { PartnerEvent } from './events';

const { partnerWebhooks, partnerWebhookDeliveries } = schema;

/** Subscription metadata for the admin panel — never includes the secret. */
export interface WebhookRow {
    id: number;
    userId: number;
    name: string;
    url: string;
    events: PartnerEvent[];
    isActive: boolean;
    failureCount: number;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    disabledAt: string | null;
    createdAt: string | null;
}

/** A subscription plus its secret — internal to delivery, never returned by a route. */
export interface WebhookTarget extends WebhookRow {
    secret: string;
}

const meta = {
    id: partnerWebhooks.id,
    userId: partnerWebhooks.userId,
    name: partnerWebhooks.name,
    url: partnerWebhooks.url,
    events: partnerWebhooks.events,
    isActive: partnerWebhooks.isActive,
    failureCount: partnerWebhooks.failureCount,
    lastSuccessAt: partnerWebhooks.lastSuccessAt,
    lastFailureAt: partnerWebhooks.lastFailureAt,
    disabledAt: partnerWebhooks.disabledAt,
    createdAt: partnerWebhooks.createdAt,
};

export async function listByUser(userId: number): Promise<WebhookRow[]> {
    const rows = await db
        .select(meta)
        .from(partnerWebhooks)
        .where(eq(partnerWebhooks.userId, userId))
        .orderBy(desc(partnerWebhooks.createdAt));
    return rows as WebhookRow[];
}

export async function findById(id: number): Promise<WebhookRow | null> {
    const rows = await db.select(meta).from(partnerWebhooks).where(eq(partnerWebhooks.id, id)).limit(1);
    return (rows[0] as WebhookRow) ?? null;
}

/**
 * Active subscriptions for `event` owned by any of `userIds` — the accounts that
 * can see the record the event describes.
 */
export async function findTargets(userIds: number[], event: PartnerEvent): Promise<WebhookTarget[]> {
    if (userIds.length === 0) return [];
    const rows = await db
        .select({ ...meta, secret: partnerWebhooks.secret })
        .from(partnerWebhooks)
        .where(
            and(
                inArray(partnerWebhooks.userId, userIds),
                eq(partnerWebhooks.isActive, true),
                sql`${event} = ANY(${partnerWebhooks.events})`
            )
        );
    return rows as WebhookTarget[];
}

export interface InsertWebhook {
    userId: number;
    name: string;
    url: string;
    secret: string;
    events: PartnerEvent[];
    createdBy: number;
}

export async function insert(input: InsertWebhook): Promise<WebhookRow> {
    const rows = await db.insert(partnerWebhooks).values(input).returning(meta);
    return rows[0] as WebhookRow;
}

export async function remove(id: number): Promise<void> {
    await db.delete(partnerWebhooks).where(eq(partnerWebhooks.id, id));
}

export async function setActive(id: number, isActive: boolean): Promise<void> {
    await db
        .update(partnerWebhooks)
        .set({
            isActive,
            // Re-enabling clears the strike count, otherwise one more failure
            // would immediately disable it again.
            ...(isActive ? { failureCount: 0, disabledAt: null } : { disabledAt: sql`now()` }),
        })
        .where(eq(partnerWebhooks.id, id));
}

export async function markSuccess(id: number): Promise<void> {
    await db
        .update(partnerWebhooks)
        .set({ failureCount: 0, lastSuccessAt: sql`now()` })
        .where(eq(partnerWebhooks.id, id));
}

/** Counts a strike and disables the endpoint once it reaches `limit`. */
export async function markFailure(id: number, limit: number): Promise<void> {
    await db
        .update(partnerWebhooks)
        .set({
            failureCount: sql`${partnerWebhooks.failureCount} + 1`,
            lastFailureAt: sql`now()`,
            isActive: sql`CASE WHEN ${partnerWebhooks.failureCount} + 1 >= ${limit} THEN false ELSE ${partnerWebhooks.isActive} END`,
            disabledAt: sql`CASE WHEN ${partnerWebhooks.failureCount} + 1 >= ${limit} THEN now() ELSE ${partnerWebhooks.disabledAt} END`,
        })
        .where(eq(partnerWebhooks.id, id));
}

// ── Deliveries ──────────────────────────────────────────────────────────────

export interface DeliveryRow {
    id: number;
    webhookId: number;
    event: string;
    payload: unknown;
    status: string;
    attempts: number;
    responseCode: number | null;
    error: string | null;
    createdAt: string | null;
}

export async function createDelivery(
    webhookId: number,
    event: PartnerEvent,
    payload: unknown
): Promise<number> {
    const rows = await db
        .insert(partnerWebhookDeliveries)
        .values({ webhookId, event, payload })
        .returning({ id: partnerWebhookDeliveries.id });
    return rows[0].id;
}

export async function recordAttempt(
    id: number,
    outcome: { delivered: boolean; responseCode?: number; error?: string; nextRetryAt: Date | null }
): Promise<void> {
    await db
        .update(partnerWebhookDeliveries)
        .set({
            status: outcome.delivered ? 'delivered' : outcome.nextRetryAt ? 'pending' : 'failed',
            attempts: sql`${partnerWebhookDeliveries.attempts} + 1`,
            responseCode: outcome.responseCode ?? null,
            error: outcome.error ?? null,
            nextRetryAt: outcome.nextRetryAt ? outcome.nextRetryAt.toISOString() : null,
            updatedAt: sql`now()`,
        })
        .where(eq(partnerWebhookDeliveries.id, id));
}

/** Pending deliveries whose retry is due, with the endpoint they belong to. */
export async function dueRetries(limit: number): Promise<
    { deliveryId: number; event: PartnerEvent; payload: unknown; attempts: number; target: WebhookTarget }[]
> {
    const rows = await db
        .select({
            deliveryId: partnerWebhookDeliveries.id,
            event: partnerWebhookDeliveries.event,
            payload: partnerWebhookDeliveries.payload,
            attempts: partnerWebhookDeliveries.attempts,
            target: { ...meta, secret: partnerWebhooks.secret },
        })
        .from(partnerWebhookDeliveries)
        .innerJoin(partnerWebhooks, eq(partnerWebhooks.id, partnerWebhookDeliveries.webhookId))
        .where(
            and(
                eq(partnerWebhookDeliveries.status, 'pending'),
                eq(partnerWebhooks.isActive, true),
                or(isNull(partnerWebhookDeliveries.nextRetryAt), lte(partnerWebhookDeliveries.nextRetryAt, sql`now()`))
            )
        )
        .orderBy(partnerWebhookDeliveries.nextRetryAt)
        .limit(limit);

    return rows as unknown as {
        deliveryId: number;
        event: PartnerEvent;
        payload: unknown;
        attempts: number;
        target: WebhookTarget;
    }[];
}

export async function listDeliveries(webhookId: number, limit = 20): Promise<DeliveryRow[]> {
    const rows = await db
        .select({
            id: partnerWebhookDeliveries.id,
            webhookId: partnerWebhookDeliveries.webhookId,
            event: partnerWebhookDeliveries.event,
            payload: partnerWebhookDeliveries.payload,
            status: partnerWebhookDeliveries.status,
            attempts: partnerWebhookDeliveries.attempts,
            responseCode: partnerWebhookDeliveries.responseCode,
            error: partnerWebhookDeliveries.error,
            createdAt: partnerWebhookDeliveries.createdAt,
        })
        .from(partnerWebhookDeliveries)
        .where(eq(partnerWebhookDeliveries.webhookId, webhookId))
        .orderBy(desc(partnerWebhookDeliveries.createdAt))
        .limit(limit);
    return rows as DeliveryRow[];
}
