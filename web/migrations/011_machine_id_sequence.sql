-- Migration: Set machines.id sequence to start at 3000001 for server-side Machine ID allocation
-- This ensures all machine IDs start from 3000001 and increment from there.

-- Only advance the sequence if it hasn't been already
DO $$
BEGIN
    IF (SELECT last_value FROM machines_id_seq) < 3000001 THEN
        PERFORM setval('machines_id_seq', 3000000, true);
    END IF;
END $$;

-- Add hardware_fingerprint column to machines for deduplication
ALTER TABLE machines ADD COLUMN IF NOT EXISTS hardware_fingerprint VARCHAR(500) UNIQUE;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS computer_name VARCHAR(200);
