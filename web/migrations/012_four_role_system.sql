-- Migration: Four-Role User System
-- Renames Admin → Refurbisher, User → Technician
-- Adds Enterprise role
-- Adds fleet/lifecycle tables for Enterprise users

-- ═══════════════════════════════════════════════════════════════
-- Step 1: Drop old role constraint so we can migrate values safely
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- ═══════════════════════════════════════════════════════════════
-- Step 2: Migrate existing role values
-- ═══════════════════════════════════════════════════════════════
UPDATE users SET role = 'Refurbisher' WHERE role = 'Admin';
UPDATE users SET role = 'Technician' WHERE role = 'User';

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 3: Update role constraint
-- ════════════════════════════════════════════════════════════════════════════════
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('SuperAdmin', 'Refurbisher', 'Technician', 'Enterprise'));

-- ═══════════════════════════════════════════════════════════════
-- Step 4: Add asset_tag to machines (Enterprise fleet labelling)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS asset_tag VARCHAR(100) NULL;

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_machines_owner ON machines(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_machines_asset_tag ON machines(asset_tag);

-- ═══════════════════════════════════════════════════════════════
-- Step 5: Machine groups (Enterprise fleet organisation)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS machine_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    enterprise_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_machine_groups_owner ON machine_groups(enterprise_user_id);

-- Link machines to groups (nullable — ungrouped is fine)
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES machine_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_machines_group ON machines(group_id);

-- ═══════════════════════════════════════════════════════════════
-- Step 6: Machine lifecycle events (Enterprise tracking)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS machine_lifecycle_events (
    id SERIAL PRIMARY KEY,
    machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
        'enrolled', 'tested', 'retired', 'repaired', 'transferred', 'decommissioned'
    )),
    notes TEXT,
    recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_machine ON machine_lifecycle_events(machine_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_type ON machine_lifecycle_events(event_type);
CREATE INDEX IF NOT EXISTS idx_lifecycle_recorded_by ON machine_lifecycle_events(recorded_by);
