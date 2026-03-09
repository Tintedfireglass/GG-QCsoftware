-- Migration: Update B2C orders to support one-time purchase plan

-- Allow one_time while keeping legacy values valid for existing historical rows.
ALTER TABLE customer_orders
  DROP CONSTRAINT IF EXISTS customer_orders_plan_check;

ALTER TABLE customer_orders
  ADD CONSTRAINT customer_orders_plan_check
  CHECK (plan IN ('monthly', 'yearly', 'lifetime', 'one_time'));
