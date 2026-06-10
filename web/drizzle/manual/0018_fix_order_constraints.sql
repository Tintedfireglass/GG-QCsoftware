-- Expand the customer_orders status check to include 'refunded' and 'cancelled',
-- which the application code already sets but the original constraint didn't allow.
-- Also add a note that the plan check allows billing-type values, not plan names.

ALTER TABLE customer_orders
    DROP CONSTRAINT IF EXISTS customer_orders_status_check;

ALTER TABLE customer_orders
    ADD CONSTRAINT customer_orders_status_check
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled'));
