-- Migration: Add demo license key support

ALTER TABLE license_keys
  DROP CONSTRAINT IF EXISTS license_keys_type_check;

ALTER TABLE license_keys
  ADD CONSTRAINT license_keys_type_check
  CHECK (type IN ('single_use', 'bulk', 'demo'));

ALTER TABLE license_keys
  ADD COLUMN IF NOT EXISTS demo_customer_name VARCHAR(200);

ALTER TABLE license_keys
  ADD COLUMN IF NOT EXISTS demo_runs_used INTEGER DEFAULT 0;

ALTER TABLE license_keys
  ADD COLUMN IF NOT EXISTS demo_max_runs INTEGER DEFAULT 1;
