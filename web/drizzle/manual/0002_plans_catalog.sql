-- Pricing plans catalog + link orders to the plan they were bought from.
-- Additive & backward-compatible. Apply BEFORE deploying the matching app code.

-- 1. Plans catalog. Each plan defines the entitlement minted on purchase
--    (product_scope + platform_caps + duration), mirroring the license model.
CREATE TABLE IF NOT EXISTS plans (
    id            serial PRIMARY KEY,
    name          varchar NOT NULL,
    description   text,
    billing_type  varchar NOT NULL,                 -- one_time | recurring
    interval      varchar,                          -- month | year (recurring only)
    price_cents   integer NOT NULL,
    currency      varchar NOT NULL DEFAULT 'INR',
    product_scope text[]  NOT NULL,
    platform_caps jsonb   NOT NULL,
    duration_days integer,                          -- null = perpetual
    is_active     boolean NOT NULL DEFAULT true,
    sort_order    integer NOT NULL DEFAULT 0,
    created_at    timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at    timestamptz DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT plans_billing_type_check CHECK (billing_type IN ('one_time', 'recurring'))
);

CREATE INDEX IF NOT EXISTS idx_plans_active ON plans (is_active, sort_order);

-- 2. Orders remember which plan produced them (null for legacy env-priced orders).
ALTER TABLE customer_orders
    ADD COLUMN IF NOT EXISTS plan_id integer;
