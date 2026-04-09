-- Migration: Track demo submissions

ALTER TABLE qc_results
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

ALTER TABLE qc_results
  ADD COLUMN IF NOT EXISTS demo_license_key_id INTEGER REFERENCES license_keys(id) ON DELETE SET NULL;
