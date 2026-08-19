-- Outbound webhooks for partner integrations.
--
-- A reseller registers a URL and the events it wants; we POST a signed JSON body
-- when one occurs, so they do not have to poll. Subscriptions belong to a users
-- row, exactly like partner_api_keys, and an event reaches a subscription only
-- when that account could already see the record through the API.
CREATE TABLE IF NOT EXISTS partner_webhooks (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Human label, e.g. "Acme order system".
    name            VARCHAR NOT NULL,
    url             VARCHAR NOT NULL,
    -- Shared secret for the HMAC-SHA256 signature header. Shown once at creation.
    secret          VARCHAR NOT NULL,
    -- Subscribed event names, e.g. {qc_result.created,license.activated}.
    events          TEXT[] NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    -- Consecutive failures. Reset on any success; the endpoint is auto-disabled
    -- once it crosses the threshold so a dead URL stops costing us deliveries.
    failure_count   INTEGER NOT NULL DEFAULT 0,
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_failure_at TIMESTAMP WITH TIME ZONE,
    disabled_at     TIMESTAMP WITH TIME ZONE,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partner_webhooks_user ON partner_webhooks(user_id);

-- One row per delivery attempt: the audit trail a partner asks for when they
-- believe they missed an event, and the queue the retry job reads.
CREATE TABLE IF NOT EXISTS partner_webhook_deliveries (
    id            SERIAL PRIMARY KEY,
    webhook_id    INTEGER NOT NULL REFERENCES partner_webhooks(id) ON DELETE CASCADE,
    event         VARCHAR NOT NULL,
    payload       JSONB NOT NULL,
    -- pending → delivered | failed. `pending` rows with attempts below the cap
    -- are what the retry job picks up.
    status        VARCHAR NOT NULL DEFAULT 'pending',
    attempts      INTEGER NOT NULL DEFAULT 0,
    response_code INTEGER,
    error         TEXT,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partner_webhook_deliveries_webhook
    ON partner_webhook_deliveries(webhook_id, created_at DESC);
-- Drives the retry sweep: only pending rows that are due.
CREATE INDEX IF NOT EXISTS idx_partner_webhook_deliveries_retry
    ON partner_webhook_deliveries(next_retry_at)
    WHERE status = 'pending';
