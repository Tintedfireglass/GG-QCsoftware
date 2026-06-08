-- Auto-renewal (saved-mandate). Additive & backward-compatible.
-- Apply BEFORE deploying the matching app code.

-- License keys carry the renewal mandate + which plan to renew with.
ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS auto_renew boolean DEFAULT false;
ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS renewal_plan_id integer;
ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS gateway_customer_ref varchar;
ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS gateway_token_ref varchar;

-- Orders record whether the buyer opted into auto-renew, and whether the order
-- itself is an automatic renewal charge.
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS auto_renew boolean DEFAULT false;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS is_renewal boolean DEFAULT false;

-- Fast lookup of keys due for renewal.
CREATE INDEX IF NOT EXISTS idx_license_keys_auto_renew
    ON license_keys (auto_renew, is_active, expires_at)
    WHERE auto_renew = true;
