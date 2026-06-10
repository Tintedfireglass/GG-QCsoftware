-- Support tickets raised by B2C mobile customers (Android app "Contact Support").
-- Additive & backward-compatible. Apply BEFORE deploying the matching app code.

CREATE TABLE IF NOT EXISTS support_tickets (
    id               serial PRIMARY KEY,
    ticket_id        varchar NOT NULL,
    customer_user_id integer NOT NULL,
    subject          varchar NOT NULL,
    category         varchar,
    message          text NOT NULL,
    device_id        varchar,
    app_version      varchar,
    status           varchar NOT NULL DEFAULT 'open',   -- open | in_progress | resolved | closed
    priority         varchar NOT NULL DEFAULT 'normal',  -- low | normal | high
    admin_note       text,
    submission_ip    varchar,
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT support_tickets_status_check CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    CONSTRAINT support_tickets_priority_check CHECK (priority IN ('low', 'normal', 'high'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tickets_ticket_id ON support_tickets (ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets (created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer ON support_tickets (customer_user_id, created_at);
