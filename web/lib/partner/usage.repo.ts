import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';

const { partnerApiUsage } = schema;

export interface UsageDay {
    day: string;
    requests: number;
    errors: number;
}

export interface UsageRoute {
    route: string;
    requests: number;
}

export interface KeyUsage {
    totalRequests: number;
    totalErrors: number;
    byDay: UsageDay[];
    topRoutes: UsageRoute[];
}

/** Usage for one key over the last `days` days, shaped for the admin panel. */
export async function usageForKey(keyId: number, days = 30): Promise<KeyUsage> {
    const since = sql`CURRENT_DATE - ${sql.raw(String(days - 1))}`;
    const scope = and(eq(partnerApiUsage.keyId, keyId), gte(partnerApiUsage.day, since));

    // 4xx and 5xx both count as errors for the headline rate.
    const errors = sql<number>`COALESCE(SUM(CASE WHEN ${partnerApiUsage.statusClass} >= 4 THEN ${partnerApiUsage.requests} ELSE 0 END), 0)::int`;
    const requests = sql<number>`COALESCE(SUM(${partnerApiUsage.requests}), 0)::int`;

    const [byDay, topRoutes] = await Promise.all([
        db
            .select({ day: partnerApiUsage.day, requests, errors })
            .from(partnerApiUsage)
            .where(scope)
            .groupBy(partnerApiUsage.day)
            .orderBy(desc(partnerApiUsage.day)),
        db
            .select({ route: partnerApiUsage.route, requests })
            .from(partnerApiUsage)
            .where(scope)
            .groupBy(partnerApiUsage.route)
            .orderBy(desc(requests))
            .limit(5),
    ]);

    return {
        totalRequests: byDay.reduce((n, d) => n + d.requests, 0),
        totalErrors: byDay.reduce((n, d) => n + d.errors, 0),
        byDay,
        topRoutes,
    };
}
