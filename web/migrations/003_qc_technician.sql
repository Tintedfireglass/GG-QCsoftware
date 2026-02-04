-- Migration: Add technician tracking to QC results
-- Links QC results to the technician who submitted them

-- Step 1: Add technician_id column to qc_results
ALTER TABLE qc_results
  ADD COLUMN IF NOT EXISTS technician_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Step 2: Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_qc_results_technician ON qc_results(technician_id);

-- Step 3: (Optional) Associate existing results with a default user if needed
-- UPDATE qc_results SET technician_id = (SELECT id FROM users WHERE role = 'SuperAdmin' LIMIT 1) WHERE technician_id IS NULL;
