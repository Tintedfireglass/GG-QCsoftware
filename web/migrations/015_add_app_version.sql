-- Migration: Add app version to QC results
ALTER TABLE qc_results
ADD COLUMN IF NOT EXISTS app_version VARCHAR(50);
