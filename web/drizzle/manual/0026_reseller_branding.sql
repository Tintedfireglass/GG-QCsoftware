-- 0026: Per-reseller white-label branding.
--
-- A Reseller may ship its own wordmark and primary colour to everyone who signs
-- into the panel under it (the reseller itself plus the technicians/clients it
-- created). NULL/empty means "inherit the platform branding from System
-- Settings", which is what every existing row does — so this is additive only.
--
-- branding_logo_key mirrors the settings.logo_key pattern: the object-storage
-- key is kept beside the public URL so a replaced logo can be deleted.
ALTER TABLE users ADD COLUMN IF NOT EXISTS branding_logo_url varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS branding_logo_key varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS branding_primary_color varchar;

-- The host that activates this reseller's branding, stored lowercase with no
-- scheme, port or trailing dot (e.g. "qc.acme.com"). Branding is selected by the
-- request's host, so a domain may belong to at most one reseller — the partial
-- unique index enforces that while leaving every unbranded row NULL.
ALTER TABLE users ADD COLUMN IF NOT EXISTS branding_domain varchar;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_branding_domain
    ON users (branding_domain)
    WHERE branding_domain IS NOT NULL AND branding_domain <> '';
