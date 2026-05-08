-- Migration: Backfill license key usage counters
-- Fix older rows where current_uses is NULL or behind actual activation rows.

-- 1) Normalize NULL counters to 0
UPDATE license_keys
SET current_uses = 0
WHERE current_uses IS NULL;

-- 2) Raise counters to match activation rows when needed
UPDATE license_keys lk
SET current_uses = GREATEST(COALESCE(lk.current_uses, 0), a.activations_count)
FROM (
    SELECT license_key_id, COUNT(*)::INTEGER AS activations_count
    FROM license_key_activations
    GROUP BY license_key_id
) a
WHERE lk.id = a.license_key_id;
