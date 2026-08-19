-- Per-key API usage, rolled up by day, endpoint and status class.
--
-- Deliberately aggregated rather than one row per request: an integration polling
-- every minute would write half a million rows a year, and nobody reads individual
-- calls — what an admin needs is "which key, how much, how many errors".
-- The app buffers counts in memory and flushes them here periodically.
CREATE TABLE IF NOT EXISTS partner_api_usage (
    key_id       INTEGER NOT NULL REFERENCES partner_api_keys(id) ON DELETE CASCADE,
    day          DATE NOT NULL,
    -- Route template, e.g. /api/partner/v1/qc-results/{id} — never the resolved
    -- path, so ids do not explode the key space.
    route        VARCHAR NOT NULL,
    -- 2, 4 or 5: the status class. Enough to compute an error rate without
    -- storing every distinct code.
    status_class SMALLINT NOT NULL,
    requests     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key_id, day, route, status_class)
);

CREATE INDEX IF NOT EXISTS idx_partner_api_usage_key_day ON partner_api_usage(key_id, day DESC);
