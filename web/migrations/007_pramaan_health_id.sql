-- Add unique Health ID and Hash to qc_results
ALTER TABLE qc_results ADD COLUMN IF NOT EXISTS health_id UUID UNIQUE;
ALTER TABLE qc_results ADD COLUMN IF NOT EXISTS pramaan_hash VARCHAR(255);

-- Create index for quick verification lookups
CREATE INDEX IF NOT EXISTS idx_qc_results_health_id ON qc_results(health_id);

-- For existing records, attempt to backfill health_id with a generated UUID if it doesn't have one
UPDATE qc_results SET health_id = gen_random_uuid() WHERE health_id IS NULL;
