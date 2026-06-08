-- Android (mobile) app backend: phone+OTP identity on customer_users, device
-- registry, report storage (5 types), stress samples, and OTP codes.
-- Additive & backward-compatible. Safe to re-run (IF NOT EXISTS).
-- App contract: phone_android_api_doc.md · Plan: MOBILE_API_PLAN.md

-- 1. Unify identity on customer_users. The app logs in by phone+OTP, so email
--    and password become OPTIONAL (web checkout still sets them). Add the
--    profile fields the app sends.
ALTER TABLE customer_users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE customer_users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS first_name    varchar;
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS last_name     varchar;
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS country_code  varchar;

-- Phone lookup for OTP login (NOT unique — a web buyer and an app user with the
-- same number are intentionally the same person; the app picks the existing row).
CREATE INDEX IF NOT EXISTS idx_customer_users_phone ON customer_users (phone);

-- 2. OTP codes for phone login (hashed, short-lived, single-use, rate-limited).
CREATE TABLE IF NOT EXISTS otp_codes (
    id          serial PRIMARY KEY,
    phone       varchar NOT NULL,
    code_hash   varchar NOT NULL,          -- sha256(phone:otp:secret), never the raw OTP
    purpose     varchar NOT NULL DEFAULT 'login',
    attempts    integer NOT NULL DEFAULT 0,
    consumed_at timestamptz,
    expires_at  timestamptz NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON otp_codes (phone, created_at DESC);

-- 3. Devices the app registers (device/info upsert).
CREATE TABLE IF NOT EXISTS mobile_devices (
    id               serial PRIMARY KEY,
    customer_user_id integer NOT NULL REFERENCES customer_users(id),
    device_id        varchar NOT NULL,
    product_type     varchar NOT NULL DEFAULT 'android',
    model            varchar,
    manufacturer     varchar,
    brand            varchar,
    os               varchar,
    android_version  varchar,
    api_level        integer,
    processor        varchar,
    serial_number    varchar,
    ram              varchar,
    storage          varchar,
    info_json        jsonb,                -- full snapshot, verbatim
    last_seen_at     timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_devices_user_device
    ON mobile_devices (customer_user_id, device_id);

-- 4. Reports (all 5 types share one table; full body kept in payload_json).
CREATE TABLE IF NOT EXISTS mobile_reports (
    id                   serial PRIMARY KEY,
    report_id            varchar NOT NULL,         -- server-generated, e.g. rpt_qc_123
    customer_user_id     integer NOT NULL REFERENCES customer_users(id),
    device_id            varchar NOT NULL,
    product_type         varchar NOT NULL DEFAULT 'android',
    report_type          varchar NOT NULL,         -- BATTERY|DISPLAY|SENSORS|SINGLE|FULL_QC|STRESS_TEST
    test_type            varchar,                  -- SINGLE: BLUETOOTH/WIFI/...
    result               varchar,                  -- PASSED|FAILED|PARTIAL_PASS|SKIPPED
    score                integer,
    grade                varchar,
    passed_count         integer,
    failed_count         integer,
    tested_at            timestamptz,
    payload_json         jsonb NOT NULL,           -- full submitted body
    device_snapshot_json jsonb,
    submission_ip        varchar,
    created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_reports_report_id ON mobile_reports (report_id);
CREATE INDEX IF NOT EXISTS idx_mobile_reports_user_time ON mobile_reports (customer_user_id, tested_at DESC);
CREATE INDEX IF NOT EXISTS idx_mobile_reports_device ON mobile_reports (device_id);
CREATE INDEX IF NOT EXISTS idx_mobile_reports_type ON mobile_reports (report_type);

-- 5. Stress-test per-second GIPS samples (perfGraph, ~280 rows/report).
CREATE TABLE IF NOT EXISTS mobile_stress_samples (
    id               serial PRIMARY KEY,
    mobile_report_id integer NOT NULL REFERENCES mobile_reports(id) ON DELETE CASCADE,
    elapsed_sec      integer NOT NULL,
    gips             numeric,
    phase            varchar
);
CREATE INDEX IF NOT EXISTS idx_mobile_stress_samples_report ON mobile_stress_samples (mobile_report_id);
