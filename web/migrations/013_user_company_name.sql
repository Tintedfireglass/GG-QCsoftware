-- Migration: Add company_name to users
-- Allows storing company/organization name for Enterprise/Refurbisher users

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS company_name VARCHAR(200);
