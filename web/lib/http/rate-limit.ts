/**
 * Fixed-window rate limiter.
 *
 * Deliberately in-process: this app runs as a single Node process, so a Map is
 * both accurate enough and free. The storage detail is confined to `hit()` —
 * swapping in Redis or Postgres later means rewriting one function, not the
 * call sites.
 */

export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    /** Unix seconds when the current window resets — the `X-RateLimit-Reset` value. */
    resetAt: number;
}

interface Window {
    count: number;
    /** ms timestamp when this window ends. */
    expiresAt: number;
}

const windows = new Map<string, Window>();

/**
 * Cap on tracked keys, so junk traffic with a high-cardinality key (an IP
 * fallback, say) cannot grow the map without bound. Expired entries are dropped
 * first; if that is not enough the oldest are evicted, which at worst forgives a
 * few requests under an attack we are already shedding elsewhere.
 */
const MAX_KEYS = 10_000;

function prune(now: number): void {
    for (const [key, w] of windows) {
        if (w.expiresAt <= now) windows.delete(key);
    }
    if (windows.size <= MAX_KEYS) return;
    const excess = windows.size - MAX_KEYS;
    let dropped = 0;
    for (const key of windows.keys()) {
        windows.delete(key);
        if (++dropped >= excess) break;
    }
}

/**
 * Count one request against `key` and report whether it is allowed.
 * `windowMs` defaults to a one-minute window, matching `rate_limit_per_min`.
 */
export function hit(key: string, limit: number, windowMs = 60_000): RateLimitResult {
    const now = Date.now();
    if (windows.size > MAX_KEYS) prune(now);

    let w = windows.get(key);
    if (!w || w.expiresAt <= now) {
        w = { count: 0, expiresAt: now + windowMs };
        windows.set(key, w);
    }
    w.count++;

    return {
        allowed: w.count <= limit,
        limit,
        remaining: Math.max(0, limit - w.count),
        resetAt: Math.ceil(w.expiresAt / 1000),
    };
}

/** Standard rate-limit headers to merge into a response. */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
    return {
        'X-RateLimit-Limit': String(r.limit),
        'X-RateLimit-Remaining': String(r.remaining),
        'X-RateLimit-Reset': String(r.resetAt),
    };
}

/** Test seam — the process-local window store is otherwise invisible. */
export function resetRateLimits(): void {
    windows.clear();
}
