/**
 * The application timezone — everything a user sees is rendered in this zone:
 * dashboard tables, report pages, PDF/Excel exports and analytics day buckets.
 *
 * Timestamps are always STORED in UTC. The Postgres session runs with
 * TimeZone = GMT, so the `timestamp without time zone` columns (qc_results.timestamp,
 * machines.last_seen, ...) hold UTC wall-clock, and parseDbTimestamp() below is
 * what reads them back as UTC regardless of the host's TZ. This constant only
 * controls presentation and day-boundary maths — it never changes what is written.
 *
 * Override with APP_TIMEZONE / NEXT_PUBLIC_APP_TIMEZONE (an IANA zone name such
 * as "Asia/Kolkata"). NEXT_PUBLIC_ is required because most date rendering
 * happens in client components, where only NEXT_PUBLIC_ vars are inlined.
 */
export const APP_TIME_ZONE =
    process.env.NEXT_PUBLIC_APP_TIMEZONE || process.env.APP_TIMEZONE || "Asia/Kolkata"

/**
 * Zone-less timestamp string, e.g. "2026-08-17 11:31:23.245715" or
 * "2026-08-17T11:31:23". Deliberately does NOT match a date-only value
 * ("2026-08-17", already parsed as UTC by spec) or anything carrying a zone
 * ("…+00", "…Z").
 */
const NAIVE_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/

/**
 * Parse a timestamp that came out of Postgres into a Date.
 *
 * ALWAYS use this instead of `new Date(value)` for a database value.
 *
 * Drizzle's node-postgres driver replaces pg's timestamp/timestamptz/date type
 * parsers with identity functions (drizzle-orm/node-postgres/session.cjs), so
 * those columns arrive as raw strings and the UTC parser pinned in lib/db.ts
 * never runs. `timestamptz` values carry an offset ("…12:00:56.01+00") and parse
 * correctly, but the naive `timestamp` columns — qc_results.timestamp,
 * machines.last_seen, users.created_at, … — arrive with no zone at all. Those
 * hold UTC wall-clock, yet `new Date()` reads a zone-less string as *local*
 * time, which silently cancels out the APP_TIME_ZONE conversion and shows the
 * viewer UTC. Stamping them as UTC here is what makes the formatters correct.
 */
export function parseDbTimestamp(value: string | number | Date | null | undefined): Date | null {
    if (value === null || value === undefined || value === "") return null
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

    let input = value
    if (typeof input === "string") {
        const trimmed = input.trim()
        input = NAIVE_TIMESTAMP_RE.test(trimmed) ? `${trimmed.replace(" ", "T")}Z` : trimmed
    }

    const parsed = new Date(input)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * SQL fragment that converts a `timestamp without time zone` column (UTC
 * wall-clock) into app-timezone wall-clock, for date filters and day bucketing.
 * Use as: sql.raw(`date_trunc('day', ${toAppZoneSql('created_at')})`)
 */
export function toAppZoneSql(column: string): string {
    return `(${column} AT TIME ZONE 'UTC' AT TIME ZONE '${APP_TIME_ZONE}')`
}

/**
 * Same as toAppZoneSql but for `timestamptz` columns, which Postgres already
 * knows the instant of — a single AT TIME ZONE is enough.
 */
export function tzToAppZoneSql(column: string): string {
    return `(${column} AT TIME ZONE '${APP_TIME_ZONE}')`
}
