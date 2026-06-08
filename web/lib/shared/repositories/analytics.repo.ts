import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';

const { visitorSessions, analyticsEvents } = schema;

export interface NewSession {
    sessionId: string;
    visitorId: string;
    ipHash: string | null;
    country: string | null;
    referrer: string | null;
    referrerDomain: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    deviceType: string | null;
    browser: string | null;
    os: string | null;
    landingPath: string | null;
    userAgent: string | null;
    isBot: boolean;
    customerUserId: number | null;
}

export async function findSession(sessionId: string): Promise<{ id: number } | null> {
    const rows = await db.select({ id: visitorSessions.id }).from(visitorSessions)
        .where(eq(visitorSessions.sessionId, sessionId)).limit(1);
    return rows[0] ?? null;
}

export async function insertSession(s: NewSession): Promise<void> {
    await db.insert(visitorSessions).values({
        sessionId: s.sessionId,
        visitorId: s.visitorId,
        ipHash: s.ipHash,
        country: s.country,
        referrer: s.referrer,
        referrerDomain: s.referrerDomain,
        utmSource: s.utmSource,
        utmMedium: s.utmMedium,
        utmCampaign: s.utmCampaign,
        deviceType: s.deviceType,
        browser: s.browser,
        os: s.os,
        landingPath: s.landingPath,
        userAgent: s.userAgent,
        isBot: s.isBot,
        customerUserId: s.customerUserId,
    }).onConflictDoNothing({ target: visitorSessions.sessionId });
}

/** Bump session counters + last_seen, and attach a customer id if newly known. */
export async function touchSession(sessionId: string, isPageview: boolean, customerUserId: number | null): Promise<void> {
    await db.update(visitorSessions).set({
        lastSeenAt: sql`NOW()`,
        pageviewCount: isPageview ? sql`pageview_count + 1` : sql`pageview_count`,
        eventCount: isPageview ? sql`event_count` : sql`event_count + 1`,
        ...(customerUserId != null ? { customerUserId } : {}),
    }).where(eq(visitorSessions.sessionId, sessionId));
}

export interface NewEvent {
    sessionId: string;
    visitorId: string;
    type: string;
    name: string | null;
    path: string | null;
    referrer: string | null;
    metadata: Record<string, unknown> | null;
    isBot: boolean;
}

export async function insertEvent(e: NewEvent): Promise<void> {
    await db.insert(analyticsEvents).values({
        sessionId: e.sessionId,
        visitorId: e.visitorId,
        type: e.type,
        name: e.name,
        path: e.path,
        referrer: e.referrer,
        metadata: e.metadata,
        isBot: e.isBot,
    });
}

// ── Aggregations for the admin overview (all exclude bots) ──

export async function getKpis(since: string) {
    const { rows } = await db.execute(sql`
        WITH ev AS (
            SELECT session_id, visitor_id, type
            FROM analytics_events
            WHERE created_at >= ${since} AND is_bot = false
        )
        SELECT
            count(*) FILTER (WHERE type = 'pageview')::int AS pageviews,
            count(*) FILTER (WHERE type = 'event')::int    AS events,
            count(DISTINCT visitor_id)::int                AS visitors,
            count(DISTINCT session_id)::int                AS sessions
        FROM ev`);
    return rows[0] as { pageviews: number; events: number; visitors: number; sessions: number };
}

export async function getBounce(since: string): Promise<{ bounced: number; total: number }> {
    const { rows } = await db.execute(sql`
        SELECT
            count(*) FILTER (WHERE pv <= 1)::int AS bounced,
            count(*)::int AS total
        FROM (
            SELECT session_id, count(*) FILTER (WHERE type = 'pageview') AS pv
            FROM analytics_events
            WHERE created_at >= ${since} AND is_bot = false
            GROUP BY session_id
        ) s`);
    return rows[0] as { bounced: number; total: number };
}

export async function getTimeseries(since: string): Promise<{ day: string; pageviews: number; visitors: number }[]> {
    const { rows } = await db.execute(sql`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
               count(*) FILTER (WHERE type = 'pageview')::int AS pageviews,
               count(DISTINCT visitor_id)::int AS visitors
        FROM analytics_events
        WHERE created_at >= ${since} AND is_bot = false
        GROUP BY 1 ORDER BY 1`);
    return rows as { day: string; pageviews: number; visitors: number }[];
}

export async function getTopPages(since: string, limit = 10): Promise<{ path: string; views: number }[]> {
    const { rows } = await db.execute(sql`
        SELECT path, count(*)::int AS views
        FROM analytics_events
        WHERE type = 'pageview' AND created_at >= ${since} AND is_bot = false AND path IS NOT NULL
        GROUP BY path ORDER BY views DESC LIMIT ${limit}`);
    return rows as { path: string; views: number }[];
}

export async function getSources(since: string, limit = 10): Promise<{ source: string; sessions: number }[]> {
    const { rows } = await db.execute(sql`
        SELECT coalesce(nullif(utm_source, ''), referrer_domain, 'Direct') AS source,
               count(*)::int AS sessions
        FROM visitor_sessions
        WHERE started_at >= ${since} AND is_bot = false
        GROUP BY 1 ORDER BY sessions DESC LIMIT ${limit}`);
    return rows as { source: string; sessions: number }[];
}

/** Generic single-column session breakdown (device_type | browser | os | country). */
async function sessionBreakdown(column: 'device_type' | 'browser' | 'os' | 'country', since: string, limit: number): Promise<{ name: string; value: number }[]> {
    const col = sql.raw(column);
    const { rows } = await db.execute(sql`
        SELECT coalesce(nullif(${col}, ''), 'Unknown') AS name, count(*)::int AS value
        FROM visitor_sessions
        WHERE started_at >= ${since} AND is_bot = false
        GROUP BY 1 ORDER BY value DESC LIMIT ${limit}`);
    return rows as { name: string; value: number }[];
}

export const getDevices = (since: string) => sessionBreakdown('device_type', since, 6);
export const getBrowsers = (since: string) => sessionBreakdown('browser', since, 8);
export const getOs = (since: string) => sessionBreakdown('os', since, 8);
export const getCountries = (since: string) => sessionBreakdown('country', since, 10);

export async function getTopEvents(since: string, limit = 10): Promise<{ name: string; count: number }[]> {
    const { rows } = await db.execute(sql`
        SELECT name, count(*)::int AS count
        FROM analytics_events
        WHERE type = 'event' AND created_at >= ${since} AND is_bot = false AND name IS NOT NULL
        GROUP BY name ORDER BY count DESC LIMIT ${limit}`);
    return rows as { name: string; count: number }[];
}

export async function getFunnel(since: string): Promise<{ checkoutStarted: number; purchases: number }> {
    const { rows: a } = await db.execute(sql`
        SELECT count(DISTINCT session_id)::int AS n
        FROM analytics_events
        WHERE type = 'event' AND name = 'checkout_started' AND created_at >= ${since} AND is_bot = false`);
    const { rows: b } = await db.execute(sql`
        SELECT count(*)::int AS n
        FROM customer_orders
        WHERE status = 'paid' AND created_at >= ${since}`);
    return { checkoutStarted: (a[0]?.n as number) ?? 0, purchases: (b[0]?.n as number) ?? 0 };
}
