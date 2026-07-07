-- 0020: Attribute each license-key activation to the customer that made it,
-- so shared (bulk) keys are no longer bound to a single account.
--
-- Background: the Android activation flow "claimed" any unowned key by setting
-- license_keys.customer_user_id to the first customer that activated it, and then
-- rejected every other account with LICENSE_NOT_YOURS. That is correct for a
-- single_use B2C key (one owner) but wrong for a bulk key, which is meant to be
-- activated across many accounts up to its per-platform device cap.
--
-- Fix: the customer <-> device link moves onto the activation row. Ownership
-- (license_keys.customer_user_id) now applies only to single_use keys; bulk/demo
-- keys stay unowned and their per-customer entitlement is derived from the
-- activations this column records.

-- 1) Record the activating customer on each activation (nullable: Windows/PC
--    activations and legacy rows have no customer).
ALTER TABLE license_key_activations
    ADD COLUMN IF NOT EXISTS customer_user_id integer;

-- 2) Backfill existing Android activations from the key's current owner so
--    already-activated devices keep their entitlement after step 3 un-claims
--    shared keys.
UPDATE license_key_activations a
SET customer_user_id = lk.customer_user_id
FROM license_keys lk
WHERE a.license_key_id = lk.id
  AND a.platform = 'android'
  AND a.customer_user_id IS NULL
  AND lk.customer_user_id IS NOT NULL;

-- 3) Un-claim shared keys that the old flow wrongly bound to one account. Only
--    single_use keys remain customer-owned; bulk/demo become shareable again.
UPDATE license_keys
SET customer_user_id = NULL
WHERE type IN ('bulk', 'demo')
  AND customer_user_id IS NOT NULL;

-- 4) Support per-customer entitlement/status lookups on activations.
CREATE INDEX IF NOT EXISTS idx_lka_customer_platform
    ON license_key_activations (customer_user_id, platform);
