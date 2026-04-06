-- Migration: Add Client role for Enterprise subusers
-- Adds Client role to the users.role constraint

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('SuperAdmin', 'Refurbisher', 'Technician', 'Enterprise', 'Client'));
