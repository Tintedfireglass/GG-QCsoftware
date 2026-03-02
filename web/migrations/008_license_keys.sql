-- Migration: Add License Key System
-- Adds tables for 16-digit license keys, activations, and user generation quotas

-- Step 1: Add license_credits to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS license_credits INTEGER DEFAULT 0;

-- Step 2: Create License Keys Table
CREATE TABLE IF NOT EXISTS license_keys (
    id SERIAL PRIMARY KEY,
    key VARCHAR(19) UNIQUE NOT NULL, -- Format: XXXX-XXXX-XXXX-XXXX
    type VARCHAR(20) NOT NULL CHECK (type IN ('single_use', 'bulk')),
    max_uses INTEGER NOT NULL CHECK (max_uses > 0),
    current_uses INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Step 3: Create Activations (Node-Locking) Table
CREATE TABLE IF NOT EXISTS license_key_activations (
    id SERIAL PRIMARY KEY,
    license_key_id INTEGER NOT NULL REFERENCES license_keys(id) ON DELETE CASCADE,
    machine_serial VARCHAR(255) NOT NULL,
    activated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_license_key_machine UNIQUE (license_key_id, machine_serial)
);

-- Step 4: Add Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_license_keys_key ON license_keys(key);
CREATE INDEX IF NOT EXISTS idx_license_keys_created_by ON license_keys(created_by);
CREATE INDEX IF NOT EXISTS idx_license_activations_machine ON license_key_activations(machine_serial);
