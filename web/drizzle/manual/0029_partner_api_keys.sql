-- Partner (reseller) API keys.
--
-- Long-lived, revocable credentials that let a reseller call /api/partner/v1/*
-- from their own backend. A key resolves to exactly one users row, so every
-- existing service and the row-visibility rules in lib/shared/domain/visibility.ts
-- apply unchanged — the key adds authentication, never authority.
--
-- Only the SHA-256 of the key is stored; the plaintext is shown once at creation.
CREATE TABLE IF NOT EXISTS partner_api_keys (
    id                 SERIAL PRIMARY KEY,
    user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Human label, e.g. "Acme production backend".
    name               VARCHAR NOT NULL,
    -- Leading segment of the plaintext key (pk_live_a1b2c3), shown in the UI so
    -- an admin can tell two keys apart without ever storing the secret.
    key_prefix         VARCHAR NOT NULL,
    key_hash           VARCHAR NOT NULL,
    -- Granted scopes, e.g. {qc:read,machines:read}. Empty = the key can only
    -- call GET /api/partner/v1/me.
    scopes             TEXT[] NOT NULL DEFAULT '{}',
    rate_limit_per_min INTEGER NOT NULL DEFAULT 120,
    -- Browser origins allowed to call with this key. Empty (the default) means
    -- server-to-server only: no CORS headers are emitted at all.
    allowed_origins    TEXT[] NOT NULL DEFAULT '{}',
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at         TIMESTAMP WITH TIME ZONE,
    last_used_at       TIMESTAMP WITH TIME ZONE,
    revoked_at         TIMESTAMP WITH TIME ZONE,
    created_by         INTEGER REFERENCES users(id),
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- The hash is the lookup key on every partner request, and two keys can never
-- collide on it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_api_keys_hash ON partner_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_partner_api_keys_user ON partner_api_keys(user_id);
