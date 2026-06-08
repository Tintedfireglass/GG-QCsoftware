-- Storefront visitor analytics (first-party). Additive & backward-compatible.
-- Apply BEFORE deploying the matching app code.

-- 1. One row per visit. IPs are never stored raw — only a salted hash plus a
--    best-effort country. First-touch attribution captured at session creation.
CREATE TABLE IF NOT EXISTS visitor_sessions (
    id              serial PRIMARY KEY,
    session_id      varchar NOT NULL UNIQUE,
    visitor_id      varchar NOT NULL,
    ip_hash         varchar,
    country         varchar,
    referrer        text,
    referrer_domain varchar,
    utm_source      varchar,
    utm_medium      varchar,
    utm_campaign    varchar,
    device_type     varchar,
    browser         varchar,
    os              varchar,
    landing_path    varchar,
    user_agent      text,
    is_bot          boolean NOT NULL DEFAULT false,
    customer_user_id integer,
    pageview_count  integer NOT NULL DEFAULT 0,
    event_count     integer NOT NULL DEFAULT 0,
    started_at      timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_visitor_sessions_started ON visitor_sessions (started_at);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_visitor ON visitor_sessions (visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_bot ON visitor_sessions (is_bot);

-- 2. Pageviews + custom events. Joined to sessions for device/source/country breakdowns.
CREATE TABLE IF NOT EXISTS analytics_events (
    id         serial PRIMARY KEY,
    session_id varchar NOT NULL,
    visitor_id varchar NOT NULL,
    type       varchar NOT NULL,                 -- pageview | event
    name       varchar,                          -- custom event name; null for pageviews
    path       varchar,
    referrer   text,
    metadata   jsonb,
    is_bot     boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT analytics_events_type_check CHECK (type IN ('pageview', 'event'))
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events (created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events (type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_path ON analytics_events (path);
