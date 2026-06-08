-- Migration: Add payment_gateways table
-- Purpose: Store payment gateway configurations with encrypted credentials

CREATE TABLE IF NOT EXISTS payment_gateways (
    id SERIAL PRIMARY KEY,
    provider VARCHAR NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_gateways_provider ON payment_gateways(provider);

-- Sample Razorpay gateway (commented out - add via admin API)
-- INSERT INTO payment_gateways (provider, is_active, config) VALUES (
--     'razorpay',
--     true,
--     '{"keyId": "rzp_test_xxxxx", "keySecret": "secret_xxxxx"}'::jsonb
-- );
