-- Migration: Add Role-Based User Management
-- Adds new user roles: SuperAdmin, Admin, User
-- Adds user hierarchy with created_by relationship

-- Step 1: Add new columns
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);

-- Step 2: Migrate existing roles to new structure
-- Admin -> SuperAdmin (can manage other admins)
-- Viewer -> User (technician level)
UPDATE users SET role = 'SuperAdmin' WHERE role = 'Admin';
UPDATE users SET role = 'User' WHERE role = 'Viewer';

-- Step 3: Update role constraint (PostgreSQL doesn't support ALTER CONSTRAINT, so we recreate)
-- First drop existing constraint if any
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Add new constraint for valid roles
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('SuperAdmin', 'Admin', 'User'));

-- Step 4: Create index for faster lookups on created_by
CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by);

-- Step 5: Set display names based on role (optional - one-time data migration)
UPDATE users SET display_name = username WHERE display_name IS NULL;
