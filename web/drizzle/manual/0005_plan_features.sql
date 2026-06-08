-- Plan marketing feature bullets (storefront). Additive & backward-compatible.
-- Apply BEFORE deploying the matching app code.

ALTER TABLE plans ADD COLUMN IF NOT EXISTS features jsonb DEFAULT '[]'::jsonb;
