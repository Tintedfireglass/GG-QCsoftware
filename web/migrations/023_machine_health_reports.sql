-- Machine health reports (server health agent / CLI push)
CREATE TABLE IF NOT EXISTS machine_health_reports (
    id BIGSERIAL PRIMARY KEY,
    machine_id BIGINT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    collected_at TIMESTAMPTZ NULL,
    agent_version TEXT NULL,
    report_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_machine_health_reports_machine_created
    ON machine_health_reports (machine_id, created_at DESC);

