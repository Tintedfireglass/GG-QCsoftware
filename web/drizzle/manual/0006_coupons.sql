-- Discount/coupon codes applied at checkout. Additive & backward-compatible.
-- Apply BEFORE deploying the matching app code.

-- 1. Coupons catalog. A coupon is independent of any single plan: it applies to
--    all plans by default, or to an optional plan allow-list.
CREATE TABLE IF NOT EXISTS coupons (
    id                  serial PRIMARY KEY,
    code                varchar NOT NULL UNIQUE,            -- stored uppercased
    description         text,
    discount_type       varchar NOT NULL,                   -- percent | fixed
    discount_value      integer NOT NULL,                   -- percent: 1..100 | fixed: cents
    max_discount_cents  integer,                            -- optional cap for percent discounts
    currency            varchar,                            -- fixed coupons only; must match plan
    min_order_cents     integer NOT NULL DEFAULT 0,
    max_redemptions     integer,                            -- global cap; null = unlimited
    times_redeemed      integer NOT NULL DEFAULT 0,         -- paid redemptions counted
    per_customer_limit  integer DEFAULT 1,                  -- null = unlimited
    applicable_plan_ids integer[],                          -- null/empty = all plans
    valid_from          timestamptz,
    valid_until         timestamptz,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at          timestamptz DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT coupons_discount_type_check CHECK (discount_type IN ('percent', 'fixed'))
);

CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons (is_active);

-- 2. One row per PAID coupon use. Unique on order_id keeps callback retries
--    idempotent; enables per-customer limit checks and an audit trail.
CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id               serial PRIMARY KEY,
    coupon_id        integer NOT NULL,
    customer_user_id integer NOT NULL,
    order_id         integer NOT NULL UNIQUE,
    discount_cents   integer NOT NULL,
    created_at       timestamptz DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON coupon_redemptions (coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_customer ON coupon_redemptions (coupon_id, customer_user_id);

-- 3. Orders record the discount applied (audit). amount_cents stays the final
--    charged amount; subtotal_cents is the pre-discount price.
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS subtotal_cents integer;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS coupon_id integer;
