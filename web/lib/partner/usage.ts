import { sql } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';
import { logger } from '@/lib/logger';

const { partnerApiUsage } = schema;

/**
 * Per-key API usage counters.
 *
 * Counts accumulate in memory and are flushed as aggregated upserts, so a
 * request never waits on a usage write. The cost of that trade is the current
 * window: if the process dies, up to FLUSH_INTERVAL_MS of counts are lost.
 * Acceptable — this drives an admin usage panel, not billing.
 */

interface Counter {
    keyId: number;
    day: string;
    route: string;
    statusClass: number;
    requests: number;
}

const buffer = new Map<string, Counter>();

const FLUSH_INTERVAL_MS = 30_000;
/** Flush early rather than let an unbounded burst sit in memory. */
const MAX_BUFFERED = 500;

let flushTimer: NodeJS.Timeout | null = null;

/**
 * Collapse a resolved path back to its route template so ids do not explode the
 * key space: `/api/partner/v1/qc-results/2239` → `/api/partner/v1/qc-results/{id}`.
 * Numeric and uuid-ish segments are the only dynamic ones in this namespace.
 */
export function routeTemplate(pathname: string): string {
    return pathname
        .split('/')
        .map((seg) => (/^\d+$/.test(seg) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) ? '{id}' : seg))
        .join('/');
}

/** Record one request. Never throws — usage tracking must not break a response. */
export function record(keyId: number, pathname: string, status: number): void {
    try {
        const day = new Date().toISOString().slice(0, 10);
        const route = routeTemplate(pathname);
        const statusClass = Math.floor(status / 100);
        const id = `${keyId}|${day}|${route}|${statusClass}`;

        const existing = buffer.get(id);
        if (existing) existing.requests++;
        else buffer.set(id, { keyId, day, route, statusClass, requests: 1 });

        if (buffer.size >= MAX_BUFFERED) void flush();
        else scheduleFlush();
    } catch {
        /* counting is best-effort */
    }
}

function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush();
    }, FLUSH_INTERVAL_MS);
    // Do not hold the process open just to flush counters.
    flushTimer.unref?.();
}

/** Write the buffered counts and clear them. Exported for tests and shutdown. */
export async function flush(): Promise<void> {
    if (buffer.size === 0) return;
    const rows = [...buffer.values()];
    buffer.clear();

    try {
        await db
            .insert(partnerApiUsage)
            .values(rows)
            .onConflictDoUpdate({
                target: [
                    partnerApiUsage.keyId,
                    partnerApiUsage.day,
                    partnerApiUsage.route,
                    partnerApiUsage.statusClass,
                ],
                set: { requests: sql`${partnerApiUsage.requests} + excluded.requests` },
            });
    } catch (err) {
        // Losing a window of counters is not worth retrying or alerting on, but
        // a persistent failure should be visible in the logs.
        logger.warn('partner_usage_flush_failed', { err, rows: rows.length });
    }
}
