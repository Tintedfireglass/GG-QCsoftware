-- Migration: Add Client + Reseller roles
-- Adds Client and Reseller roles to the users.role constraint

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('SuperAdmin', 'Refurbisher', 'Reseller', 'Technician', 'Enterprise', 'Client'));
