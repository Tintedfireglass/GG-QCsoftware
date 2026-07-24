/**
 * Rolling window, in days, that report lists show by default. Anything older is
 * still stored and readable — it just moves behind the "Archive" view instead of
 * padding out the default list. Shared by the PC (`qc_results`) and mobile
 * (`mobile_reports`) list queries so both sides sit on the same boundary.
 *
 * Kept dependency-free on purpose: client components import it for their labels,
 * so nothing here may pull in drizzle or any other server-only module.
 */
export const REPORT_RETENTION_DAYS = 30;

/**
 * The window as a Postgres interval literal, for repos to wrap in `sql.raw`.
 * Interpolating is safe — the value is an internal numeric constant, never user
 * input — and Postgres will not accept a bind parameter inside an interval literal.
 */
export const RETENTION_INTERVAL_SQL = `INTERVAL '${REPORT_RETENTION_DAYS} days'`;
