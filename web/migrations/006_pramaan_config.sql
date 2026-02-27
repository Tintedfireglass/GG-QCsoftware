-- Create pramaan_scoring_versions table
CREATE TABLE IF NOT EXISTS pramaan_scoring_versions (
    version_id VARCHAR(50) PRIMARY KEY,
    weights JSONB NOT NULL,
    grade_bands JSONB NOT NULL,
    risk_thresholds JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure only one active version at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_scoring_version ON pramaan_scoring_versions (is_active) WHERE is_active = true;

-- Insert default 1.0.0 configuration
INSERT INTO pramaan_scoring_versions (version_id, weights, grade_bands, risk_thresholds, is_active)
VALUES (
    '1.0.0',
    '{ "storage": 0.25, "thermal": 0.20, "battery": 0.20, "cpu_ram": 0.15, "physical_ports": 0.10, "repair_modifier": 0.10 }'::jsonb,
    '[{"Grade": "A+", "MinScore": 90}, {"Grade": "A", "MinScore": 80}, {"Grade": "B", "MinScore": 65}, {"Grade": "C", "MinScore": 50}, {"Grade": "Reject", "MinScore": 0}]'::jsonb,
    '{ "storage": 40, "thermal": 40, "battery": 35, "cpu_ram": 30, "physical_ports": 50, "repair_modifier": 50 }'::jsonb,
    true
)
ON CONFLICT (version_id) DO NOTHING;
