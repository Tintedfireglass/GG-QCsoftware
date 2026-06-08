-- SMS providers (pluggable, admin-configured) for OTP/transactional SMS.
-- Mirrors email_providers. MSG91 is the first provider; more drop in later.
-- Additive & backward-compatible. Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS sms_providers (
    id         serial PRIMARY KEY,
    provider   varchar NOT NULL,              -- msg91 | ... (future)
    is_active  boolean NOT NULL DEFAULT false, -- exactly one active at a time
    config     jsonb   NOT NULL,              -- { authKey, templateId, senderId, ... }
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_providers_provider ON sms_providers (provider);
