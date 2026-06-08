export const ACTIVE_WINDOW_MS = 4 * 60 * 60 * 1000
export const POLL_INTERVAL_MS = 15 * 60 * 1000
export const NOW_TICK_MS = 60 * 1000

export function isMachineActive(
    lastSeen?: string | null,
    nowMs: number = Date.now(),
    windowMs: number = ACTIVE_WINDOW_MS
): boolean {
    if (!lastSeen) return false
    const t = Date.parse(lastSeen)
    if (!Number.isFinite(t)) return false
    return nowMs - t <= windowMs
}

