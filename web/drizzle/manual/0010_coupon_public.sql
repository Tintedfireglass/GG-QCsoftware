-- Let admins advertise selected coupons on the public storefront checkout.
-- Additive & backward-compatible. Apply BEFORE deploying the matching app code.

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_coupons_public ON coupons (is_public, is_active);
