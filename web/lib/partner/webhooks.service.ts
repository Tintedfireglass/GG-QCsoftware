import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { eq } from 'drizzle-orm';
import { AuthenticatedUser } from '@/lib/auth-middleware';
import { db, schema } from '@/lib/drizzle';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/http/errors';
import { logger } from '@/lib/logger';
import { UserRole } from '@/lib/types';
import { findUserForManage } from '@/lib/shared/repositories/users.repo';
import { PartnerEvent } from './events';
import { canOwnPartnerKey } from './scopes';
import * as repo from './webhooks.repo';
import type { WebhookRow, WebhookTarget } from './webhooks.repo';

const { users } = schema;

/**
 * Outbound webhooks: registration (SuperAdmin only, like API keys) and delivery.
 *
 * Delivery is fire-and-forget from the request that caused the event — a partner's
 * slow endpoint must never slow down a QC submission — and every attempt is
 * recorded, so a failed POST becomes a retry rather than a lost event.
 */

/** Attempts before a delivery is abandoned (1 immediate + retries). */
const MAX_ATTEMPTS = 5;
/** Consecutive failures before the endpoint itself is disabled. */
const FAILURE_LIMIT = 20;
/** A partner's endpoint gets this long to answer before we call it a failure. */
const TIMEOUT_MS = 5_000;

// 1m, 5m, 30m, 2h — enough to ride out a deploy or a short outage.
const BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000];

// ── Registration ────────────────────────────────────────────────────────────

async function assertManageable(actor: AuthenticatedUser, userId: number): Promise<void> {
    if (actor.role !== 'SuperAdmin') {
        throw new ForbiddenError('Only administrators can manage partner webhooks');
    }
    const target = await findUserForManage(userId);
    if (!target) throw new NotFoundError('User not found');
    if (!canOwnPartnerKey(target.role as UserRole)) {
        throw new ValidationError(`${target.role} accounts cannot receive partner webhooks`);
    }
}

export async function listWebhooks(actor: AuthenticatedUser, userId: number): Promise<WebhookRow[]> {
    await assertManageable(actor, userId);
    return repo.listByUser(userId);
}

export interface CreateWebhookInput {
    userId: number;
    name: string;
    url: string;
    events: PartnerEvent[];
}

/** The secret is returned once, at creation, and never again. */
export async function createWebhook(
    actor: AuthenticatedUser,
    input: CreateWebhookInput
): Promise<{ webhook: WebhookRow; secret: string }> {
    await assertManageable(actor, input.userId);

    let parsed: URL;
    try {
        parsed = new URL(input.url);
    } catch {
        throw new ValidationError('url must be an absolute URL');
    }
    // Signed payloads over plaintext HTTP would still be readable in transit.
    if (parsed.protocol !== 'https:') throw new ValidationError('url must use https');
    if (!input.events.length) throw new ValidationError('Subscribe to at least one event');

    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const webhook = await repo.insert({
        userId: input.userId,
        name: input.name,
        url: input.url,
        secret,
        events: input.events,
        createdBy: actor.id,
    });
    return { webhook, secret };
}

export async function deleteWebhook(actor: AuthenticatedUser, id: number): Promise<void> {
    const webhook = await repo.findById(id);
    if (!webhook) throw new NotFoundError('Webhook not found');
    await assertManageable(actor, webhook.userId);
    await repo.remove(id);
}

/** Re-enable an endpoint that was auto-disabled, or pause a noisy one. */
export async function setWebhookActive(actor: AuthenticatedUser, id: number, isActive: boolean): Promise<void> {
    const webhook = await repo.findById(id);
    if (!webhook) throw new NotFoundError('Webhook not found');
    await assertManageable(actor, webhook.userId);
    await repo.setActive(id, isActive);
}

export async function listDeliveries(actor: AuthenticatedUser, id: number) {
    const webhook = await repo.findById(id);
    if (!webhook) throw new NotFoundError('Webhook not found');
    await assertManageable(actor, webhook.userId);
    return repo.listDeliveries(id);
}

// ── Delivery ────────────────────────────────────────────────────────────────

/** `X-Webhook-Signature: t=<unix>,v1=<hex>` over `${t}.${body}`. */
export function signPayload(secret: string, timestamp: number, body: string): string {
    return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Constant-time check, for the verification snippet we hand partners. */
export function verifySignature(secret: string, timestamp: number, body: string, signature: string): boolean {
    const expected = Buffer.from(signPayload(secret, timestamp, body));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function attempt(
    target: WebhookTarget,
    deliveryId: number,
    event: PartnerEvent,
    payload: unknown,
    priorAttempts: number
): Promise<void> {
    const body = JSON.stringify({ event, sentAt: new Date().toISOString(), data: payload });
    const timestamp = Math.floor(Date.now() / 1000);

    try {
        const response = await fetch(target.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Event': event,
                'X-Webhook-Timestamp': String(timestamp),
                'X-Webhook-Signature': `t=${timestamp},v1=${signPayload(target.secret, timestamp, body)}`,
            },
            body,
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (response.ok) {
            await Promise.all([
                repo.recordAttempt(deliveryId, { delivered: true, responseCode: response.status, nextRetryAt: null }),
                repo.markSuccess(target.id),
            ]);
            return;
        }
        await fail(target, deliveryId, priorAttempts, response.status, `HTTP ${response.status}`);
    } catch (err) {
        await fail(target, deliveryId, priorAttempts, undefined, err instanceof Error ? err.message : 'Request failed');
    }
}

async function fail(
    target: WebhookTarget,
    deliveryId: number,
    priorAttempts: number,
    responseCode: number | undefined,
    error: string
): Promise<void> {
    const attempts = priorAttempts + 1;
    const backoff = BACKOFF_MS[attempts - 1];
    const nextRetryAt = attempts < MAX_ATTEMPTS && backoff !== undefined ? new Date(Date.now() + backoff) : null;

    await Promise.all([
        repo.recordAttempt(deliveryId, { delivered: false, responseCode, error, nextRetryAt }),
        repo.markFailure(target.id, FAILURE_LIMIT),
    ]);
}

/**
 * The accounts that may hear about a record created by `actorUserId`: the actor
 * itself and whoever created it. That is exactly the visibility rule in
 * `ownerVisibilitySql`, so a webhook never reveals more than the API would.
 */
async function ownersFor(actorUserId: number): Promise<number[]> {
    const rows = await db
        .select({ id: users.id, createdBy: users.createdBy })
        .from(users)
        .where(eq(users.id, actorUserId))
        .limit(1);
    const row = rows[0];
    if (!row) return [];
    return row.createdBy ? [row.id, row.createdBy] : [row.id];
}

/**
 * Emit an event to every subscriber entitled to it.
 *
 * Call it without awaiting: it never throws, and the triggering request should
 * not wait on a partner's server.
 */
export async function emitPartnerEvent(
    event: PartnerEvent,
    actorUserId: number | null,
    payload: Record<string, unknown>
): Promise<void> {
    try {
        if (!actorUserId) return;
        const targets = await repo.findTargets(await ownersFor(actorUserId), event);
        if (!targets.length) return;

        await Promise.all(
            targets.map(async (target) => {
                const deliveryId = await repo.createDelivery(target.id, event, payload);
                await attempt(target, deliveryId, event, payload, 0);
            })
        );
    } catch (err) {
        logger.warn('partner_webhook_emit_failed', { err, event });
    }
}

/**
 * Re-attempt deliveries whose backoff has elapsed. Driven by the admin retry
 * endpoint (cron), because there is no queue worker in this app.
 */
export async function runWebhookRetries(limit = 50): Promise<{ retried: number }> {
    const due = await repo.dueRetries(limit);
    await Promise.all(
        due.map((d) => attempt(d.target, d.deliveryId, d.event, d.payload, d.attempts))
    );
    return { retried: due.length };
}
