-- Per-plan auto-renewal eligibility. Additive & backward-compatible.
-- Apply BEFORE deploying the matching app code.

-- Admin controls which (finite-duration) plans offer the auto-renew checkbox.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS allow_auto_renew boolean NOT NULL DEFAULT false;

-- Subscriptions were not built; collapse any legacy 'recurring' plans to one_time.
UPDATE plans SET billing_type = 'one_time', interval = NULL WHERE billing_type = 'recurring';
