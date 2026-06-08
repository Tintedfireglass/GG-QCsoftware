import * as repo from '@/lib/shared/repositories/analytics.repo';
import { parseUserAgent, hashIp, referrerDomain } from '@/lib/shared/analytics/parse';
import { TrackInput } from '@/lib/shared/domain/schemas/analytics';

export interface TrackContext {
    userAgent: string | null;
    ip: string | null;
    country: string | null;
    customerUserId: number | null;
}

/** Record one pageview or custom event. Best-effort: never throws to the caller. */
export async function recordEvent(input: TrackInput, ctx: TrackContext): Promise<void> {
    const ua = parseUserAgent(ctx.userAgent);
    const isPageview = input.type === 'pageview';

    // Create the session on first contact (first-touch attribution); else touch it.
    const existing = await repo.findSession(input.sessionId);
    if (!existing) {
        await repo.insertSession({
            sessionId: input.sessionId,
            visitorId: input.visitorId,
            ipHash: hashIp(ctx.ip),
            country: ctx.country,
            referrer: input.referrer ?? null,
            referrerDomain: referrerDomain(input.referrer),
            utmSource: input.utmSource ?? null,
            utmMedium: input.utmMedium ?? null,
            utmCampaign: input.utmCampaign ?? null,
            deviceType: ua.deviceType,
            browser: ua.browser,
            os: ua.os,
            landingPath: input.path,
            userAgent: ctx.userAgent,
            isBot: ua.isBot,
            customerUserId: ctx.customerUserId,
        });
    }
    await repo.touchSession(input.sessionId, isPageview, ctx.customerUserId);

    await repo.insertEvent({
        sessionId: input.sessionId,
        visitorId: input.visitorId,
        type: input.type,
        name: input.name ?? null,
        path: input.path,
        referrer: input.referrer ?? null,
        metadata: (input.metadata as Record<string, unknown>) ?? null,
        isBot: ua.isBot,
    });
}

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

/** Aggregate dashboard payload for a preset range (default 30 days). */
export async function getOverview(range: string) {
    const days = RANGE_DAYS[range] ?? 30;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const [kpis, bounce, timeseries, topPages, sources, devices, browsers, os, countries, topEvents, funnel] =
        await Promise.all([
            repo.getKpis(since),
            repo.getBounce(since),
            repo.getTimeseries(since),
            repo.getTopPages(since),
            repo.getSources(since),
            repo.getDevices(since),
            repo.getBrowsers(since),
            repo.getOs(since),
            repo.getCountries(since),
            repo.getTopEvents(since),
            repo.getFunnel(since),
        ]);

    const sessions = kpis.sessions || 0;
    const bounceRate = bounce.total > 0 ? Math.round((bounce.bounced / bounce.total) * 100) : 0;
    const pagesPerSession = sessions > 0 ? Math.round((kpis.pageviews / sessions) * 10) / 10 : 0;

    return {
        range: { key: range in RANGE_DAYS ? range : '30d', days, since },
        kpis: {
            visitors: kpis.visitors || 0,
            sessions,
            pageviews: kpis.pageviews || 0,
            events: kpis.events || 0,
            bounceRate,
            pagesPerSession,
        },
        timeseries,
        topPages,
        sources,
        devices,
        browsers,
        os,
        countries,
        topEvents,
        funnel: { visitors: kpis.visitors || 0, checkoutStarted: funnel.checkoutStarted, purchases: funnel.purchases },
    };
}
