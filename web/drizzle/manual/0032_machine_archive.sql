-- Manual archiving for machines.
--
-- The report lists archive by age (a rolling 30-day window); machines archive by
-- hand instead — a device is retired, sold on or swapped out, and the operator
-- moves it out of the working list themselves. Nothing is deleted: the row keeps
-- all its history and simply moves behind the Archive view.
--
-- Timestamp rather than a boolean so "when was this retired" is answerable later;
-- NULL means the machine is still in the active list.
ALTER TABLE machines ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

-- The default list asks for archived_at IS NULL on every load, so index the
-- archived rows only — the partial index stays tiny and Postgres can still use
-- it for the "show me the archive" side.
CREATE INDEX IF NOT EXISTS idx_machines_archived_at
    ON machines (archived_at DESC)
    WHERE archived_at IS NOT NULL;
