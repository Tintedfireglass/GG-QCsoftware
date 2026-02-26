-- PRAMAAN Scoring System Migration
-- Run this against your PostgreSQL database AFTER init-db.sql

-- Add PRAMAAN columns to qc_results
ALTER TABLE qc_results ADD COLUMN IF NOT EXISTS pramaan_score INTEGER;
ALTER TABLE qc_results ADD COLUMN IF NOT EXISTS pramaan_grade VARCHAR(10);
ALTER TABLE qc_results ADD COLUMN IF NOT EXISTS pramaan_category_scores JSONB;
ALTER TABLE qc_results ADD COLUMN IF NOT EXISTS pramaan_risk_flags JSONB;
ALTER TABLE qc_results ADD COLUMN IF NOT EXISTS pramaan_algorithm_version VARCHAR(50);

-- Index for PRAMAAN grade filtering
CREATE INDEX IF NOT EXISTS idx_qc_results_pramaan_grade ON qc_results(pramaan_grade);
CREATE INDEX IF NOT EXISTS idx_qc_results_pramaan_score ON qc_results(pramaan_score);
