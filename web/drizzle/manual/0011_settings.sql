-- System settings + email settings (providers & editable templates).
-- Additive & backward-compatible. Apply BEFORE deploying the matching app code.
-- Safe to re-run (IF NOT EXISTS).

-- 1. General/branding settings — one JSONB blob per category (key='general').
CREATE TABLE IF NOT EXISTS app_settings (
    key        varchar PRIMARY KEY,
    value      jsonb NOT NULL,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
);

-- 2. Email provider credentials (smtp | brevo | …). Modelled on payment_gateways:
--    only one provider is active at a time; secrets live in config (redacted on read).
CREATE TABLE IF NOT EXISTS email_providers (
    id         serial PRIMARY KEY,
    provider   varchar NOT NULL,
    is_active  boolean NOT NULL DEFAULT false,
    config     jsonb NOT NULL,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_providers_provider ON email_providers (provider);

-- 3. Admin-editable transactional email templates. A missing row means the code
--    default (template registry) is used; editing creates/updates the override.
CREATE TABLE IF NOT EXISTS email_templates (
    key        varchar PRIMARY KEY,
    name       varchar NOT NULL,
    subject    text NOT NULL,
    html       text NOT NULL,
    text       text NOT NULL,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
);
