-- Add per-user temporary key duration permission flags
-- SuperAdmin can toggle which expiry durations are allowed per user
-- Applies to: Refurbisher, Enterprise, OEM, Insurer, Reseller, Client roles
-- SuperAdmin and Employee have their own hardcoded logic (unaffected)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS allow_monthly_keys   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_quarterly_keys BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_6month_keys    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_yearly_keys    BOOLEAN NOT NULL DEFAULT false;
