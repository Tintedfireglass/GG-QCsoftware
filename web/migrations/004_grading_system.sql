-- Migration: Add grading columns to qc_results and test_results
-- Run this against your PostgreSQL database after the initial schema

-- Add grading columns to qc_results
ALTER TABLE qc_results
    ADD COLUMN IF NOT EXISTS overall_score INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS overall_grade VARCHAR(2) DEFAULT '';

-- Add grading columns to test_results
ALTER TABLE test_results
    ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS grade VARCHAR(2) DEFAULT '';

-- Create index for grade-based filtering
CREATE INDEX IF NOT EXISTS idx_qc_results_overall_grade ON qc_results(overall_grade);
