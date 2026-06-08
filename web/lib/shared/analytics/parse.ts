import { createHash } from 'crypto';

const IP_SALT = process.env.ANALYTICS_IP_SALT || process.env.JWT_SECRET || 'pmn-analytics-salt';

export interface UaInfo {
    deviceType: 'desktop' | 'mobile' | 'tablet';
    browser: string;
    os: string;
    isBot: boolean;
}

/** Lightweight, dependency-free user-agent classification. Good enough for
 *  storefront breakdowns; not a substitute for a full UA database. */
export function parseUserAgent(uaRaw: string | null | undefined): UaInfo {
    const ua = (uaRaw || '').toLowerCase();

    const isBot = /bot|crawl|spider|slurp|bingpreview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|axios|http-client|facebookexternalhit|whatsapp|telegrambot|preview/.test(ua);

    let os = 'Unknown';
    if (/windows nt/.test(ua)) os = 'Windows';
    else if (/iphone|ipad|ipod/.test(ua)) os = 'iOS';
    else if (/mac os x|macintosh/.test(ua)) os = 'macOS';
    else if (/android/.test(ua)) os = 'Android';
    else if (/cros/.test(ua)) os = 'ChromeOS';
    else if (/linux/.test(ua)) os = 'Linux';

    let browser = 'Unknown';
    if (/edg\//.test(ua)) browser = 'Edge';
    else if (/opr\/|opera/.test(ua)) browser = 'Opera';
    else if (/samsungbrowser/.test(ua)) browser = 'Samsung Internet';
    else if (/chrome\/|crios/.test(ua)) browser = 'Chrome';
    else if (/firefox\/|fxios/.test(ua)) browser = 'Firefox';
    else if (/safari\//.test(ua) && !/chrome|crios/.test(ua)) browser = 'Safari';

    let deviceType: UaInfo['deviceType'] = 'desktop';
    if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) deviceType = 'tablet';
    else if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/.test(ua)) deviceType = 'mobile';

    return { deviceType, browser, os, isBot };
}

/** Salted, truncated SHA-256 of the IP. Never store or log the raw IP. */
export function hashIp(ip: string | null | undefined): string | null {
    if (!ip) return null;
    return createHash('sha256').update(`${IP_SALT}|${ip}`).digest('hex').slice(0, 32);
}

/** Bare hostname of a referrer URL (www. stripped), or null. */
export function referrerDomain(ref: string | null | undefined): string | null {
    if (!ref) return null;
    try {
        return new URL(ref).hostname.replace(/^www\./, '') || null;
    } catch {
        return null;
    }
}

/** Best-effort visitor country from CDN/proxy headers (ISO-3166 alpha-2). */
export function countryFromHeaders(get: (name: string) => string | null): string | null {
    const candidates = [
        'cf-ipcountry',            // Cloudflare
        'x-vercel-ip-country',     // Vercel
        'x-geo-country',
        'x-country-code',
        'x-appengine-country',     // Google
    ];
    for (const h of candidates) {
        const v = get(h);
        if (v && v !== 'XX' && v.length <= 3) return v.toUpperCase();
    }
    return null;
}
