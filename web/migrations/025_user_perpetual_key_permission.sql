-- Add allow_perpetual_keys permission flag
-- SuperAdmin can toggle if a user is allowed to generate perpetual (forever) keys
-- Default is true for backward compatibility with existing users

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS allow_perpetual_keys BOOLEAN NOT NULL DEFAULT true;
