# Web API Reference

> **Audience:** Backend and frontend engineers  
> **Classification:** Internal

---

## Base URL

```
https://pramaan-dashboard.gadgetguruz.com/api
```

For local development:
```
http://localhost:3000/api
```

---

## Authentication

All protected endpoints require a JWT Bearer token:

```
Authorization: Bearer <token>
```

Tokens are obtained via `POST /api/auth/login`. On 401 responses, the client should clear the stored token and redirect to login.

**Public endpoints** (no auth required):
- `POST /api/auth/login`
- `GET /api/verify/:healthId`
- `POST /api/pramaan/submit` (CLI submissions use license-based auth)

---

## Auth Endpoints

### `POST /api/auth/login`
Authenticate a user (dashboard login) or a CLI/desktop client (license key login).

**Request:**
```json
{
  "identifier": "admin",
  "password": "yourpassword"
}
```

**CLI/License login:**
```json
{
  "licenseKey": "XXXX-XXXX-XXXX",
  "machineSerial": "SN123456",
  "macAddress": "aa:bb:cc:dd:ee:ff",
  "computerName": "LAPTOP-001"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": { "id": 1, "username": "admin", "role": "SuperAdmin" }
}
```

---

### `POST /api/auth/register`
Create a new user account. Requires authentication. The caller's role determines which roles can be created.

**Request:**
```json
{
  "username": "john_tech",
  "password": "securepassword",
  "email": "john@example.com",
  "role": "Technician",
  "company_name": "Refurb Co",
  "display_name": "John Smith",
  "license_credits": 10
}
```

---

## QC Results Endpoints

### `GET /api/qc-results`
List QC results with pagination and filtering.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `limit` | number | Results per page (default: 20) |
| `offset` | number | Pagination offset |
| `search` | string | Search by serial, model, report ID |
| `hasIssues` | `true` | Filter to machines with failing grades only |
| `includeTotal` | `0` | Skip total count query for performance |

**Response:**
```json
{
  "results": [
    {
      "id": 1234,
      "report_id": "uuid",
      "timestamp": "2026-05-18T10:00:00Z",
      "system_model": "ThinkPad X1 Carbon",
      "system_serial": "PF2ABCDE",
      "mac_address": "aa:bb:cc:dd:ee:ff",
      "overall_pass": true,
      "overall_score": 84,
      "pramaan_score": 84,
      "pramaan_grade": "A",
      "pramaan_category_scores": { "storage": 78, "thermal": 88, ... },
      "pramaan_risk_flags": { "storage": false, "battery": false, ... }
    }
  ]
}
```

---

### `GET /api/qc-results/count`
Count QC results matching a filter (same query params as list, minus pagination).

**Response:**
```json
{ "total": 1547 }
```

---

### `GET /api/qc-results/issues-summary`
Get count of machines with issues (any failing test or low grade).

**Response:**
```json
{
  "devicesWithIssues": 12,
  "totalDevices": 450
}
```

---

### `GET /api/qc-results/:id`
Get a single QC result by database ID, including all test results and JSON detail blobs.

---

### `POST /api/qc-results`
Submit a new QC result from the CLI or desktop app.

**Request:** `SubmitQCResultRequest` (see `web/lib/types.ts`)

Key fields:
```json
{
  "reportId": "uuid",
  "machineId": "SN123456",
  "timestamp": "2026-05-18T10:00:00Z",
  "overallPass": true,
  "overallScore": 84,
  "systemInfo": { "serialNumber": "...", "model": "...", "macAddress": "..." },
  "testResults": [
    { "testType": "CPU", "tested": true, "passed": true, "score": 85 },
    { "testType": "Storage", "tested": true, "passed": true, "score": 78 }
  ],
  "pramaanScore": 84,
  "pramaanGrade": "A",
  "pramaanHash": "sha256hexstring",
  "pramaanCategoryScores": { "storage": 78, "thermal": 88, ... },
  "pramaanAlgorithmVersion": "Scoring Engine v1.0.2"
}
```

**Response (200):**
```json
{ "success": true, "id": 1234, "healthId": "uuid" }
```

---

## Machines Endpoints

### `GET /api/machines`
List all machines visible to the authenticated user.

**Query parameters:**
- `countOnly=1` — return only `{ "total": N }` for dashboard counter
- `search` — filter by serial, model, name

### `GET /api/machines/:id`
Get a single machine with its full history.

### `PATCH /api/machines/:id`
Update a machine's custom name.

```json
{ "customName": "Finance Laptop 01" }
```

---

## Machine History Endpoints

### `POST /api/machine-history`
Submit component grade history (used by `--auto-basic-qc`).

```json
{
  "machineId": "SN123456",
  "source": "auto_basic_qc",
  "componentGrades": {
    "CPU": { "score": 85, "grade": "A" },
    "Storage": { "score": 78, "grade": "A" }
  }
}
```

### `GET /api/machine-history/alerts`
Get degradation alerts — machines where a component grade dropped in the last N days.

**Query params:** `recentDays=30`, `limit=10`

**Response:**
```json
{
  "alerts": [
    {
      "machine_id": 42,
      "machine_identifier": "SN123456",
      "custom_name": "Finance Laptop 01",
      "component": "Battery",
      "previous_grade": "A",
      "latest_grade": "B",
      "latest_timestamp": "2026-05-17T09:00:00Z"
    }
  ]
}
```

---

## Users Endpoints

### `GET /api/users`
List users (paginated). Callers only see users they are permitted to see based on role.

**Query params:** `page`, `limit`, `search`, `role`

### `GET /api/users/stats`
Get user count statistics.

**Response:**
```json
{ "totalUsers": 45, "totalAdmins": 8, "totalTechnicians": 37 }
```

### `GET /api/users/:id`
Get a single user by ID.

### `PUT /api/users/:id`
Update a user's details (role, email, active status, credits, password).

### `DELETE /api/users/:id`
Deactivate/delete a user.

---

## License Key Endpoints

### `GET /api/licenses`
List license keys visible to the authenticated user.

### `POST /api/licenses`
Create a new license key.

```json
{
  "type": "bulk",
  "max_uses": 50,
  "expires_at": "2027-01-01T00:00:00Z",
  "demo_customer_name": null
}
```

### `PATCH /api/licenses`
Activate or deactivate a license key.

```json
{ "id": 7, "is_active": false }
```

---

## Pramaan Scoring Config

### `GET /api/pramaan/config`
Returns the active scoring configuration. Called by CLI/desktop app at the start of each QC run.

**Response:**
```json
{
  "version": "1.0.2",
  "weights": {
    "storage": 0.25,
    "thermal": 0.20,
    "battery": 0.20,
    "cpu_ram": 0.15,
    "physical_ports": 0.10,
    "repair_modifier": 0.10
  },
  "gradeBands": [
    { "grade": "A+",     "minScore": 90 },
    { "grade": "A",      "minScore": 80 },
    { "grade": "B",      "minScore": 65 },
    { "grade": "C",      "minScore": 50 },
    { "grade": "Reject", "minScore": 0  }
  ],
  "riskThresholds": {
    "storage": 40, "thermal": 40, "battery": 35,
    "cpu_ram": 30, "physical_ports": 50, "repair_modifier": 50
  },
  "defaultRepairModifierScore": 100,
  "certificationValidityDays": 180
}
```

---

## Server Health Endpoints

### `POST /api/server-health`
Submit a server health report from the Pramaan Agent.

**Request:** `SubmitServerHealthRequest`
```json
{
  "schemaVersion": "1.0",
  "machineId": 42,
  "collectedAt": "2026-05-18T10:00:00Z",
  "agentVersion": "1.0.0",
  "overallStatus": "ok",
  "checks": [
    { "name": "cpu", "status": "ok", "summary": "load1=0.5", "metrics": { "load1": 0.5 } },
    { "name": "disk", "status": "degraded", "summary": "worst_used=85%" }
  ]
}
```

---

## Public Verification

### `GET /api/verify/:healthId`
Public endpoint — no authentication required.

Returns certification data for display on the public verification page.

**Response:**
```json
{
  "healthId": "uuid",
  "timestamp": "2026-05-18T10:00:00Z",
  "systemModel": "ThinkPad X1 Carbon",
  "systemSerial": "****BCDE",
  "pramaanScore": 84,
  "pramaanGrade": "A",
  "overallPass": true
}
```

---

## Fleet Endpoints (Enterprise)

### `GET /api/fleet`
List enrolled fleet machines for the authenticated enterprise user.

**Query params:** `search`, `group_id`

### `POST /api/fleet`
Enroll a new machine into the enterprise fleet.

```json
{
  "machine_id": "SN123456",
  "asset_tag": "ASSET-0042",
  "group_id": 3,
  "serial_number": "SN123456",
  "manufacturer": "Lenovo",
  "model": "ThinkPad X1"
}
```

---

## Error Response Format

All errors follow this format:

```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

**Common HTTP status codes:**

| Code | Meaning |
|---|---|
| 200 | Success |
| 400 | Bad request / validation error |
| 401 | Unauthorized (token missing, expired, or invalid) |
| 403 | Forbidden (role does not permit this action) |
| 404 | Resource not found |
| 409 | Conflict (duplicate resource) |
| 500 | Internal server error |

---

*← Back to [Documentation Index](../README.md)*
