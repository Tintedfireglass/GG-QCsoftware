-- Database initialization script for QC Admin System
-- Run this against your PostgreSQL database

-- Create machines table
CREATE TABLE IF NOT EXISTS machines (
    id              SERIAL PRIMARY KEY,
    machine_id      VARCHAR(100) UNIQUE NOT NULL,
    serial_number   VARCHAR(100),
    mac_address     VARCHAR(50),
    manufacturer    VARCHAR(100),
    model           VARCHAR(100),
    last_seen       TIMESTAMP,
    location        VARCHAR(100),
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Create qc_results table
CREATE TABLE IF NOT EXISTS qc_results (
    id                  SERIAL PRIMARY KEY,
    report_id           VARCHAR(50) UNIQUE NOT NULL,
    machine_id          INTEGER REFERENCES machines(id),
    timestamp           TIMESTAMP NOT NULL,
    refurbish_id        VARCHAR(100),
    technician_notes    TEXT,
    overall_pass        BOOLEAN NOT NULL,
    
    -- System Info Snapshot
    system_manufacturer VARCHAR(100),
    system_model        VARCHAR(100),
    system_serial       VARCHAR(100),
    mac_address         VARCHAR(50),
    cpu_model           VARCHAR(200),
    ram_total           BIGINT,
    
    -- JSON fields for detailed data
    system_info_json    JSONB,
    cpu_details_json    JSONB,
    ram_details_json    JSONB,
    storage_details_json JSONB,
    battery_details_json JSONB,
    device_details_json  JSONB,
    
    created_at          TIMESTAMP DEFAULT NOW()
);

-- Create indexes for qc_results
CREATE INDEX IF NOT EXISTS idx_qc_results_machine ON qc_results(machine_id);
CREATE INDEX IF NOT EXISTS idx_qc_results_timestamp ON qc_results(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_qc_results_refurbish ON qc_results(refurbish_id);
CREATE INDEX IF NOT EXISTS idx_qc_results_overall_pass ON qc_results(overall_pass);

-- Create test_results table
CREATE TABLE IF NOT EXISTS test_results (
    id              SERIAL PRIMARY KEY,
    qc_result_id    INTEGER REFERENCES qc_results(id) ON DELETE CASCADE,
    test_type       VARCHAR(50) NOT NULL,
    tested          BOOLEAN NOT NULL,
    passed          BOOLEAN NOT NULL,
    message         VARCHAR(500),
    details_json    JSONB,
    timestamp       TIMESTAMP
);

-- Create indexes for test_results
CREATE INDEX IF NOT EXISTS idx_test_results_qc ON test_results(qc_result_id);
CREATE INDEX IF NOT EXISTS idx_test_results_type ON test_results(test_type);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(100) UNIQUE NOT NULL,
    password_hash   VARCHAR(500) NOT NULL,
    role            VARCHAR(50) DEFAULT 'Viewer',
    email           VARCHAR(200),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Create default admin user (password: admin123)
-- IMPORTANT: Change this password after first login!
INSERT INTO users (username, password_hash, role, email)
VALUES (
    'admin',
    '$2a$10$rQZ5YvHvJvJvJvJvJvJvJO5YvHvJvJvJvJvJvJvJvJvJvJvJvJvJv', 
    'Admin',
    'admin@example.com'
) ON CONFLICT (username) DO NOTHING;

-- Note: The password hash above is for 'admin123'
-- You should change it immediately after deployment
