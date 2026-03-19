-- Migration: Add License Key Audit Log
-- Tracks enable/disable actions on license keys

CREATE TABLE IF NOT EXISTS license_key_audits (
    id SERIAL PRIMARY KEY,
    license_key_id INTEGER NOT NULL REFERENCES license_keys(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL CHECK (action IN ('enable', 'disable')),
    previous_is_active BOOLEAN NOT NULL,
    new_is_active BOOLEAN NOT NULL,
    performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_license_key_audits_key ON license_key_audits(license_key_id);
CREATE INDEX IF NOT EXISTS idx_license_key_audits_performed_by ON license_key_audits(performed_by);
