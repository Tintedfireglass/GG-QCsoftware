-- Multi-product licensing: product scope + per-platform device caps.
-- Additive & backward-compatible. Apply BEFORE deploying the matching app code.
-- Safe to re-run (IF NOT EXISTS + idempotent backfills).

-- 1. License keys: which platforms a key unlocks + per-platform device caps.
ALTER TABLE license_keys
    ADD COLUMN IF NOT EXISTS product_scope text[] DEFAULT ARRAY['windows']::text[];
ALTER TABLE license_keys
    ADD COLUMN IF NOT EXISTS platform_caps jsonb;

-- 2. Activations: tag each device activation with its platform.
ALTER TABLE license_key_activations
    ADD COLUMN IF NOT EXISTS platform varchar DEFAULT 'windows';

-- 3. Backfill existing rows → everything is "windows" today.
UPDATE license_keys
    SET product_scope = ARRAY['windows']::text[]
    WHERE product_scope IS NULL;
UPDATE license_keys
    SET platform_caps = jsonb_build_object('windows', max_uses)
    WHERE platform_caps IS NULL;
UPDATE license_key_activations
    SET platform = 'windows'
    WHERE platform IS NULL;

-- 4. Speed up "which keys cover platform X" lookups.
CREATE INDEX IF NOT EXISTS idx_license_keys_product_scope
    ON license_keys USING gin (product_scope);
CREATE INDEX IF NOT EXISTS idx_license_key_activations_key_platform
    ON license_key_activations (license_key_id, platform);
