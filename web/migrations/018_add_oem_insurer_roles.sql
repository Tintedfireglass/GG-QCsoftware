-- Migration 018: Add OEM and Insurer user roles
-- These roles have the same access level as Enterprise

-- Step 1: Drop the existing role CHECK constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Step 2: Re-add the constraint with OEM and Insurer included
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('SuperAdmin', 'Employee', 'Refurbisher', 'Reseller', 'Technician', 'Enterprise', 'OEM', 'Insurer', 'Client'));
