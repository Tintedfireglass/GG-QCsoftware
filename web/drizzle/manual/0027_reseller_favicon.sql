-- 0027: Per-reseller browser tab icon.
--
-- Companion to 0026: a reseller reached on its own domain already ships its own
-- wordmark and primary colour, but the tab still showed the platform's icon.
-- NULL/empty means "inherit the platform favicon from System Settings", which is
-- what every existing row does — additive only.
--
-- branding_favicon_key mirrors branding_logo_key: the object-storage key is kept
-- beside the public URL so a replaced icon can be deleted.
ALTER TABLE users ADD COLUMN IF NOT EXISTS branding_favicon_url varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS branding_favicon_key varchar;
