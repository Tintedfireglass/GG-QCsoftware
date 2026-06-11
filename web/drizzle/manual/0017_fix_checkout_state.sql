-- Fix: ensure checkout_state column exists on customer_orders.
-- The 0000 migration was introspected (commented out) so this column may be
-- missing on deployments where the table was built purely from ALTER TABLE files.

ALTER TABLE customer_orders
    ADD COLUMN IF NOT EXISTS checkout_state varchar NOT NULL DEFAULT '';

-- Remove the DEFAULT so future inserts must supply the value explicitly,
-- keeping the NOT NULL constraint strict.
ALTER TABLE customer_orders
    ALTER COLUMN checkout_state DROP DEFAULT;

-- Also ensure payment_reference and gateway_reference exist (they were in
-- the original commented-out 0000 migration but never in an ALTER TABLE file).
ALTER TABLE customer_orders
    ADD COLUMN IF NOT EXISTS payment_reference varchar;

ALTER TABLE customer_orders
    ADD COLUMN IF NOT EXISTS gateway_reference varchar;

-- Ensure generated_license_key_id exists.
ALTER TABLE customer_orders
    ADD COLUMN IF NOT EXISTS generated_license_key_id integer;
