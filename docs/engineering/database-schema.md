# Database Schema

> **Audience:** Backend engineers  
> **Classification:** Internal

---

## Overview

The Pramaan web dashboard uses **PostgreSQL**. The schema has evolved through 23 sequential migration files located in `web/migrations/`. Run them in order against a fresh database to set up the full schema.

**Connection:** `DATABASE_URL` environment variable (standard PostgreSQL connection string)

---

## Core Tables

### `machines`
Represents a physical device that has been tested at least once.

```sql
CREATE TABLE machines (
    id              SERIAL PRIMARY KEY,
    machine_id      VARCHAR(100) UNIQUE NOT NULL,  -- Serial or identity key
    serial_number   VARCHAR(100),
    mac_address     VARCHAR(50),
    manufacturer    VARCHAR(100),
    model           VARCHAR(100),
    computer_name   VARCHAR(200),
    custom_name     VARCHAR(200),                  -- Human-assigned label
    last_seen       TIMESTAMP,
    location        VARCHAR(100),
    created_at      TIMESTAMP DEFAULT NOW()
);
```

**Key notes:**
- `machine_id` is the normalized identity key (serial → computer name → MAC, in priority order)
- `custom_name` is set by admins via the dashboard for easy identification
- `last_seen` is updated on every heartbeat or QC submission

---

### `qc_results`
One row per completed QC run. The central fact table.

```sql
CREATE TABLE qc_results (
    id                      SERIAL PRIMARY KEY,
    report_id               VARCHAR(50) UNIQUE NOT NULL,  -- UUID from client
    machine_id              INTEGER REFERENCES machines(id),
    timestamp               TIMESTAMP NOT NULL,
    refurbish_id            VARCHAR(100),
    technician_notes        TEXT,
    app_version             VARCHAR(50),
    overall_pass            BOOLEAN NOT NULL,
    overall_score           INTEGER DEFAULT 0,
    overall_grade           VARCHAR(2),

    -- System info snapshot
    system_manufacturer     VARCHAR(100),
    system_model            VARCHAR(100),
    system_serial           VARCHAR(100),
    mac_address             VARCHAR(50),
    cpu_model               VARCHAR(200),
    ram_total               BIGINT,

    -- JSONB detail blobs
    system_info_json        JSONB,
    cpu_details_json        JSONB,
    ram_details_json        JSONB,
    storage_details_json    JSONB,
    battery_details_json    JSONB,
    device_details_json     JSONB,
    submission_ip           VARCHAR(64),

    -- Pramaan scoring
    pramaan_score           INTEGER,
    health_id               VARCHAR(100) UNIQUE,   -- Public verification UUID
    pramaan_hash            VARCHAR(64),           -- SHA-256 tamper-evident hash
    pramaan_grade           VARCHAR(10),
    pramaan_category_scores JSONB,
    pramaan_risk_flags      JSONB,
    pramaan_algorithm_version VARCHAR(20),

    -- Demo/B2C flags
    is_demo                 BOOLEAN DEFAULT FALSE,
    demo_license_key_id     INTEGER,

    created_at              TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
```sql
CREATE INDEX idx_qc_results_machine    ON qc_results(machine_id);
CREATE INDEX idx_qc_results_timestamp  ON qc_results(timestamp DESC);
CREATE INDEX idx_qc_results_refurbish  ON qc_results(refurbish_id);
CREATE INDEX idx_qc_results_overall    ON qc_results(overall_pass);
CREATE INDEX idx_qc_results_health_id  ON qc_results(health_id);
```

---

### `test_results`
One row per individual component test within a QC run.

```sql
CREATE TABLE test_results (
    id              SERIAL PRIMARY KEY,
    qc_result_id    INTEGER REFERENCES qc_results(id) ON DELETE CASCADE,
    test_type       VARCHAR(50) NOT NULL,  -- "CPU", "RAM", "Storage", etc.
    tested          BOOLEAN NOT NULL,
    passed          BOOLEAN NOT NULL,
    score           INTEGER DEFAULT 0,
    grade           VARCHAR(2),
    message         VARCHAR(500),
    details_json    JSONB,
    timestamp       TIMESTAMP
);
```

**Test type values:** `CPU`, `RAM`, `Storage`, `Battery`, `GPU`, `Network`, `Keyboard`, `Trackpad`, `USB`, `AudioVideo`, `AudioJack`

---

### `users`
User accounts for the dashboard.

```sql
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(100) UNIQUE NOT NULL,
    password_hash   VARCHAR(500) NOT NULL,          -- bcryptjs hash
    role            VARCHAR(50) NOT NULL,
    email           VARCHAR(200),
    company_name    VARCHAR(200),
    display_name    VARCHAR(200),
    created_by      INTEGER REFERENCES users(id),   -- Who created this account
    is_active       BOOLEAN DEFAULT TRUE,
    license_credits INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

**Valid role values:** `SuperAdmin`, `Employee`, `Refurbisher`, `Reseller`, `Technician`, `Enterprise`, `OEM`, `Insurer`, `Client`, `B2CDevice`

---

### `license_keys`
License keys used by CLI/desktop clients for authentication.

```sql
CREATE TABLE license_keys (
    id                  SERIAL PRIMARY KEY,
    key                 VARCHAR(100) UNIQUE NOT NULL,
    type                VARCHAR(20) NOT NULL,       -- single_use, bulk, demo
    max_uses            INTEGER NOT NULL DEFAULT 1,
    current_uses        INTEGER NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at          TIMESTAMP,
    created_by          INTEGER REFERENCES users(id),
    demo_customer_name  VARCHAR(200),
    created_at          TIMESTAMP DEFAULT NOW()
);
```

---

### `machine_history`
Time-series component grade history — one row per component per submission.

```sql
CREATE TABLE machine_history (
    id                  SERIAL PRIMARY KEY,
    machine_id          INTEGER REFERENCES machines(id),
    timestamp           TIMESTAMP NOT NULL DEFAULT NOW(),
    source              VARCHAR(50),                -- "full_qc", "auto_basic_qc"
    component           VARCHAR(50) NOT NULL,       -- "CPU", "Storage", etc.
    score               INTEGER,
    grade               VARCHAR(10),
    app_version         VARCHAR(50),
    created_at          TIMESTAMP DEFAULT NOW()
);
```

Used for:
- Degradation alerts (comparing previous vs. latest grade per component)
- Machine health timeline graphs

---

### `free_trials`
Free trial sessions for potential customers.

```sql
CREATE TABLE free_trials (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(200) NOT NULL,
    machine_serial  VARCHAR(100) NOT NULL,
    mac_address     VARCHAR(50),
    computer_name   VARCHAR(200),
    machine_id      INTEGER REFERENCES machines(id),
    machine_identifier VARCHAR(100),
    trial_start_utc TIMESTAMP NOT NULL,
    trial_end_utc   TIMESTAMP NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    revoked_at      TIMESTAMP,
    revoke_reason   TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

---

### `server_health_reports`
Health check reports submitted by the Pramaan Agent from Linux servers.

```sql
CREATE TABLE server_health_reports (
    id              SERIAL PRIMARY KEY,
    machine_id      INTEGER REFERENCES machines(id),
    schema_version  VARCHAR(20),
    collected_at    TIMESTAMP NOT NULL,
    agent_version   VARCHAR(50),
    overall_status  VARCHAR(20),                    -- ok, degraded, critical
    checks_json     JSONB,                          -- Array of check results
    created_at      TIMESTAMP DEFAULT NOW()
);
```

---

## Fleet Tables (Enterprise)

### `machine_groups`
Named groups for organizing fleet machines.

```sql
CREATE TABLE machine_groups (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(200) NOT NULL,
    description         TEXT,
    enterprise_user_id  INTEGER REFERENCES users(id),
    created_at          TIMESTAMP DEFAULT NOW()
);
```

### `fleet_machines`
Links machines to enterprise users with additional fleet metadata.

```sql
CREATE TABLE fleet_machines (
    id              SERIAL PRIMARY KEY,
    machine_id      INTEGER REFERENCES machines(id),
    owner_user_id   INTEGER REFERENCES users(id),
    asset_tag       VARCHAR(100),
    group_id        INTEGER REFERENCES machine_groups(id),
    enrolled_at     TIMESTAMP DEFAULT NOW()
);
```

### `machine_lifecycle_events`
Audit trail of events for fleet machines.

```sql
CREATE TABLE machine_lifecycle_events (
    id              SERIAL PRIMARY KEY,
    machine_id      INTEGER REFERENCES machines(id),
    event_type      VARCHAR(50),  -- enrolled, tested, retired, repaired, transferred, decommissioned
    notes           TEXT,
    recorded_by     INTEGER REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT NOW()
);
```

---

## Schema Migration History

| Migration | Description |
|---|---|
| `002_user_roles.sql` | Added role column to users |
| `003_qc_technician.sql` | Technician role support |
| `004_grading_system.sql` | Added score/grade columns to test_results |
| `005_pramaan_scoring.sql` | Added pramaan_score, pramaan_grade to qc_results |
| `006_pramaan_config.sql` | Pramaan scoring config table |
| `007_pramaan_health_id.sql` | Added health_id and pramaan_hash |
| `008_license_keys.sql` | License key table |
| `009_b2c_customers.sql` | B2C customer support |
| `010_b2c_one_time_purchase.sql` | B2C purchase tracking |
| `011_machine_id_sequence.sql` | Machine ID auto-increment floor |
| `012_four_role_system.sql` | Full RBAC role expansion |
| `013_add_client_role.sql` | Client role addition |
| `013_user_company_name.sql` | Added company_name to users |
| `014_license_key_audit.sql` | License key audit trail |
| `015_add_app_version.sql` | App version field in qc_results |
| `016_custom_machine_name_and_submission_ip.sql` | Custom name + IP tracking |
| `017_add_employee_role.sql` | Employee role |
| `018_add_demo_license_keys.sql` | Demo license key type |
| `018_add_oem_insurer_roles.sql` | OEM and Insurer roles |
| `019_add_demo_qc_fields.sql` | Demo QC result flags |
| `020_add_machine_history.sql` | Machine history table |
| `021_free_trials.sql` | Free trial system |
| `022_backfill_license_key_uses.sql` | Back-fill current_uses from activations |
| `023_machine_health_reports.sql` | Server health reports table |

---

## Running Migrations

Migrations must be run in order against a PostgreSQL database. Apply them sequentially:

```bash
# Example using psql
psql $DATABASE_URL -f web/lib/init-db.sql        # Base schema
psql $DATABASE_URL -f web/migrations/002_user_roles.sql
# ... continue in order ...
psql $DATABASE_URL -f web/migrations/023_machine_health_reports.sql
```

---

*← Back to [Documentation Index](../README.md)*
