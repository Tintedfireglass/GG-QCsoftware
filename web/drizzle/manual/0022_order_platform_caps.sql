-- Per-platform checkout: persist the buyer-chosen device caps on the order.
-- The store checkout lets a buyer pick a device count per platform (e.g.
-- { windows: 4, android: 2 }); those caps are authoritative for the license key
-- minted on payment (product_scope = its keys, max_uses = sum of values).
-- Null for legacy / uniform-quantity orders, which keep scaling the plan's caps
-- by `quantity`. Additive & backward-compatible. Safe to re-run (IF NOT EXISTS).

ALTER TABLE customer_orders
    ADD COLUMN IF NOT EXISTS platform_caps jsonb;
