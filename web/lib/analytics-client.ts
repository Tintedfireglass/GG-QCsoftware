// Storefront analytics client. Anonymous IDs live in localStorage (visitor,
// persists across visits) and sessionStorage (session, per visit). All sends are
// best-effort and never throw.

const VID_KEY = 'pmn_vid';
const SID_KEY = 'pmn_sid';

type EventType = 'pageview' | 'event';

function uuid(): string {
    try {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    } catch { /* fall through */ }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.floor(Math.random() * 16);
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function getVisitorId(): string {
    try {
        let v = localStorage.getItem(VID_KEY);
        if (!v) { v = uuid(); localStorage.setItem(VID_KEY, v); }
        return v;
    } catch { return uuid(); }
}

function getSessionId(): string {
    try {
        let s = sessionStorage.getItem(SID_KEY);
        if (!s) { s = uuid(); sessionStorage.setItem(SID_KEY, s); }
        return s;
    } catch { return uuid(); }
}

function utm(): { utmSource?: string; utmMedium?: string; utmCampaign?: string } {
    try {
        const p = new URLSearchParams(window.location.search);
        return {
            utmSource: p.get('utm_source') || undefined,
            utmMedium: p.get('utm_medium') || undefined,
            utmCampaign: p.get('utm_campaign') || undefined,
        };
    } catch { return {}; }
}

async function send(type: EventType, name?: string, metadata?: Record<string, unknown>): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        const body = {
            visitorId: getVisitorId(),
            sessionId: getSessionId(),
            type,
            name,
            path: window.location.pathname,
            referrer: document.referrer || undefined,
            ...utm(),
            metadata,
        };
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('qc_customer_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        await fetch('/api/track', { method: 'POST', headers, body: JSON.stringify(body), keepalive: true });
    } catch { /* analytics must never break the page */ }
}

export function trackPageview(): Promise<void> {
    return send('pageview');
}

export function trackEvent(name: string, metadata?: Record<string, unknown>): Promise<void> {
    return send('event', name, metadata);
}
