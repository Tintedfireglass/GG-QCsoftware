-- Migration: Add machine history table for automated component grading

CREATE TABLE IF NOT EXISTS machine_history (
  id SERIAL PRIMARY KEY,
  machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  source VARCHAR(64) NOT NULL,
  component_grades JSONB NOT NULL,
  created_by INTEGER REFERENCES users(id),
  app_version VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_machine_history_machine_id ON machine_history(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_history_timestamp ON machine_history(timestamp);
