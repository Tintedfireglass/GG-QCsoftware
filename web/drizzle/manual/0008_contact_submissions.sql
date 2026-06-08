-- Contact / partnership form submissions from the public store website.
-- Additive & backward-compatible. Apply BEFORE deploying the matching app code.

CREATE TABLE IF NOT EXISTS contact_submissions (
    id           serial PRIMARY KEY,
    name         varchar NOT NULL,
    company_name varchar,
    phone        varchar,
    email        varchar NOT NULL,
    service      varchar DEFAULT 'PRAMAAN',
    description  text,
    source       varchar DEFAULT 'store-website',
    status       varchar NOT NULL DEFAULT 'new',     -- new | read | archived
    ip_hash      varchar,
    user_agent   text,
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT contact_submissions_status_check CHECK (status IN ('new', 'read', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_created ON contact_submissions (created_at);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_status ON contact_submissions (status);
