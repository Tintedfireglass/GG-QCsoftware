-- Migration: Add B2C customer accounts and purchase flow

-- 1) Customer accounts (separate from internal dashboard users)
CREATE TABLE IF NOT EXISTS customer_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(500) NOT NULL,
    full_name VARCHAR(120),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_users_email ON customer_users(email);

-- 2) Link license keys to B2C customers (nullable for existing B2B/admin-created keys)
ALTER TABLE license_keys
  ADD COLUMN IF NOT EXISTS customer_user_id INTEGER REFERENCES customer_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_license_keys_customer_user ON license_keys(customer_user_id);

-- 3) Customer orders/subscriptions (payment-gateway driven)
CREATE TABLE IF NOT EXISTS customer_orders (
    id SERIAL PRIMARY KEY,
    customer_user_id INTEGER NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
    plan VARCHAR(30) NOT NULL CHECK (plan IN ('monthly', 'yearly', 'lifetime')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
    payment_reference VARCHAR(255),
    gateway_reference VARCHAR(255),
    checkout_state VARCHAR(255) UNIQUE NOT NULL,
    generated_license_key_id INTEGER REFERENCES license_keys(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_orders_customer ON customer_orders(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_customer_orders_status ON customer_orders(status);
