-- Idempotency/dedup store for inbound payment-gateway webhooks.
-- Run via: npm run db:push  (or apply this file directly).
CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id          SERIAL PRIMARY KEY,
    provider    VARCHAR NOT NULL,
    event_id    VARCHAR NOT NULL,
    event_type  VARCHAR,
    received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_webhook_events_provider_event
    ON payment_webhook_events (provider, event_id);
