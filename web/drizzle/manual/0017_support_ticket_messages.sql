-- Two-way conversation messages on support tickets (admin <-> mobile customer).
-- Additive & backward-compatible. Apply BEFORE deploying the matching app code.
-- ticket_id here is support_tickets.id (the serial PK), not the public varchar ticket_id.

CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id              serial PRIMARY KEY,
    ticket_id       integer NOT NULL,
    sender          varchar NOT NULL,   -- admin | customer
    sender_admin_id integer,            -- users.id when sender = 'admin'
    body            text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT support_ticket_messages_sender_check CHECK (sender IN ('admin', 'customer'))
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON support_ticket_messages (ticket_id, created_at);
