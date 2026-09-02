-- 0033_reseller_leads.sql
-- Reseller corporate lead registry. Resellers log companies they are actively
-- pursuing so GG sales does not approach the same company directly.

CREATE TABLE IF NOT EXISTS reseller_leads (
    id              SERIAL PRIMARY KEY,
    reseller_id     INTEGER NOT NULL,
    company_name    VARCHAR(255) NOT NULL,
    contact_name    VARCHAR(255),
    contact_email   VARCHAR(255),
    contact_phone   VARCHAR(50),
    notes           TEXT,
    status          VARCHAR(50) NOT NULL DEFAULT 'active'
                        CONSTRAINT reseller_leads_status_check
                        CHECK (status IN ('active', 'converted', 'lost', 'expired')),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reseller_leads_reseller
    ON reseller_leads (reseller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reseller_leads_status
    ON reseller_leads (status);
