-- Migration: Add custom machine names and submission IP tracking

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS custom_name VARCHAR(200);

ALTER TABLE qc_results
  ADD COLUMN IF NOT EXISTS submission_ip VARCHAR(64);
