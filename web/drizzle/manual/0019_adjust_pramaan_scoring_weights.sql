-- Update the active PRAMAAN scoring config to reflect the new weights.
-- Battery increases by 0.05 and physical ports decreases by 0.05.

UPDATE pramaan_scoring_versions
SET
    version_id = '1.0.3',
    weights = '{"storage":0.25,"thermal":0.20,"battery":0.25,"cpu_ram":0.15,"physical_ports":0.05,"repair_modifier":0.10}'::jsonb
WHERE is_active = true;
