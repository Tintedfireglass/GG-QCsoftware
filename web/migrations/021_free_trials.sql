-- Migration 021: Free Trial System
-- Two tables enforce the "one email + one machine = one trial" rule server-side.

-- Table 1: free_trials
-- One row per trial activation. Tracks the machine fingerprint, email, start time,
-- and the server-allocated machine ID so trial users can submit QC data normally.
CREATE TABLE IF NOT EXISTS free_trials (
    id                  SERIAL PRIMARY KEY,
    email               VARCHAR(255) NOT NULL,
    machine_fingerprint VARCHAR(512) NOT NULL,
    machine_serial      VARCHAR(255) NOT NULL,
    mac_address         VARCHAR(64),
    computer_name       VARCHAR(255),
    machine_id          INTEGER REFERENCES machines(id) ON DELETE SET NULL,
    trial_start_utc     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    trial_end_utc       TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    revoked_at          TIMESTAMP WITH TIME ZONE,
    revoke_reason       VARCHAR(255),
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- One trial per machine fingerprint (prevents a second trial with a different email)
    CONSTRAINT uq_trial_fingerprint UNIQUE (machine_fingerprint)
);

-- Table 2: trial_email_blocks
-- A lightweight deny-list: once an email has been used for a trial on ANY device,
-- it is inserted here so it cannot be used again on a different device.
CREATE TABLE IF NOT EXISTS trial_email_blocks (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(255) NOT NULL UNIQUE,
    trial_id    INTEGER NOT NULL REFERENCES free_trials(id) ON DELETE CASCADE,
    blocked_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_free_trials_email         ON free_trials(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_free_trials_fingerprint   ON free_trials(machine_fingerprint);
CREATE INDEX IF NOT EXISTS idx_free_trials_end           ON free_trials(trial_end_utc);
CREATE INDEX IF NOT EXISTS idx_trial_email_blocks_email  ON trial_email_blocks(LOWER(email));
