/**
 * The application timezone — everything a user sees is rendered in this zone:
 * dashboard tables, report pages, PDF/Excel exports and analytics day buckets.
 *
 * Timestamps are always STORED in UTC. The Postgres session runs with
 * TimeZone = GMT, so the `timestamp without time zone` columns (qc_results.timestamp,
 * machines.last_seen, ...) hold UTC wall-clock, and lib/db.ts pins the pg driver
 * to read them back as UTC regardless of the host's TZ. This constant only
 * controls presentation and day-boundary maths — it never changes what is written.
 *
 * Override with APP_TIMEZONE / NEXT_PUBLIC_APP_TIMEZONE (an IANA zone name such
 * as "Asia/Kolkata"). NEXT_PUBLIC_ is required because most date rendering
 * happens in client components, where only NEXT_PUBLIC_ vars are inlined.
 */
export const APP_TIME_ZONE =
    process.env.NEXT_PUBLIC_APP_TIMEZONE || process.env.APP_TIMEZONE || "Asia/Kolkata"

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
