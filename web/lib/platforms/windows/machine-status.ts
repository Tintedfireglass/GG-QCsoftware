import { parseDbTimestamp } from "@/lib/timezone"

export const ACTIVE_WINDOW_MS = 4 * 60 * 60 * 1000
export const POLL_INTERVAL_MS = 15 * 60 * 1000
export const NOW_TICK_MS = 60 * 1000

export function isMachineActive(
    lastSeen?: string | null,
    nowMs: number = Date.now(),
    windowMs: number = ACTIVE_WINDOW_MS
): boolean {
    // machines.last_seen is a naive UTC column, so it must go through
    // parseDbTimestamp — reading it as local time would put every machine
    // 5:30 further in the past and show the whole fleet as offline.
    const seen = parseDbTimestamp(lastSeen)
    if (!seen) return false
    return nowMs - seen.getTime() <= windowMs
}

