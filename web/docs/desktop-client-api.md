# PRAMAAN / LaptopQC — Desktop Client API

API reference for the **desktop QC client** (Windows, macOS, Linux). All three
platforms call the **same** endpoints — the OS only matters for the auto-update
feed. There is no per-OS API surface to duplicate.

- **Base URL:** `https://<your-host>` (e.g. production host, or `http://localhost:3000` in dev)
- **Content-Type:** `application/json` for all request bodies unless noted
- **Format:** JSON in, JSON out

> An interactive OpenAPI reference is also served in-dashboard (Scalar), generated
> from `lib/openapi/`. This document is the hand-off subset the desktop client needs.

---

## 1. Authentication

There are two credentials in play:

| Credential | Header | Where it comes from | Used for |
|---|---|---|---|
| **API key** | `x-api-key: <key>` | Shared secret, provisioned out-of-band | Submitting QC results |
| **JWT** | `Authorization: Bearer <token>` | Returned by license/trial activation | Identifying the device/technician on submit |

**Typical lifecycle:**

1. On first run, the client activates a **license** (`POST /api/auth/license`) or a
   **free trial** (`POST /api/auth/trial`). Both return a **JWT** plus the resolved
   `machineId`.
2. The client stores that JWT and sends it on every QC submission **in addition to**
   the `x-api-key` header.
3. The client polls the **update feed** for its platform and self-updates when a
   newer build is published.

> The JWT encodes the device/role; the `x-api-key` authorizes the submit endpoint
> itself. A submit needs **both** (see §4).

---

## 2. Conventions

**Error envelope** — every error returns this shape with the matching HTTP status:

```json
{ "error": "Unauthorized", "message": "Invalid license key" }
```

**Common status codes**

| Code | Meaning |
|---|---|
| `200` | OK |
| `201` | Created (QC result stored) |
| `400` | Validation error (missing/invalid fields) |
| `401` | Bad/missing credential (invalid API key, license key, or token) |
| `403` | Not permitted (license expired/revoked/exhausted, trial used, wrong platform scope) |
| `404` | Not found (e.g. no published release for a platform) |
| `426` | **Upgrade required** — client version is past the cutoff; force the user to update |
| `500` | Server error |

`426` is the signal to **block usage and route the user to the updater**.

---

## 3. Health check

```
GET /api
```

Liveness + DB connectivity probe. No auth.

**200**
```json
{
  "status": "OK",
  "message": "API is running",
  "database": { "connected": true, "version": "PostgreSQL 16.x" }
}
```

---

## 4. License activation

```
POST /api/auth/license
```

Binds a license key to this machine and returns a session token. No `x-api-key`
required for this call.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `licenseKey` | string | ✅ | e.g. `PRMN-XXXX-XXXX` |
| `machineSerial` | string \| number | ✅ | Device serial; combined with MAC + name into a fingerprint |
| `macAddress` | string | – | Strongly recommended for a stable fingerprint |
| `computerName` | string | – | Host name |
| `platform` | string | – | `windows` \| `mac` \| `linux`. **Defaults to `windows`** if omitted. Send the real OS so per-platform device caps and license scope are enforced correctly. |

```json
{
  "licenseKey": "PRMN-1A2B-3C4D",
  "machineSerial": "SN123456",
  "macAddress": "00:11:22:33:44:55",
  "computerName": "QC-PC-01",
  "platform": "linux"
}
```

**200**
```json
{
  "token": "<JWT>",
  "user": { "id": 12, "username": "tech1", "role": "Technician" },
  "machineId": 345
}
```

**Errors:** `400` missing `licenseKey`/`machineSerial` · `401` invalid/revoked/expired key
· `403` key not valid for this `platform`, or device-activation cap reached.

> Re-activating the **same** device against the same key does **not** consume an
> extra activation slot — it's idempotent per (key, serial).

---

## 5. Free trial activation

```
POST /api/auth/trial
```

Starts (or resumes) a 7-day trial for a device, keyed by email + machine identity.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | ✅ | One trial per email across devices |
| `machineSerial` | string \| number | ✅ | |
| `macAddress` | string | – | Recommended |
| `computerName` | string | – | |

```json
{ "email": "tech@shop.com", "machineSerial": "SN123456", "macAddress": "00:11:22:33:44:55" }
```

**200**
```json
{
  "token": "<JWT>",
  "user": { "id": 0, "username": "tech@shop.com", "role": "TrialUser" },
  "machineId": 345,
  "trialEndsAt": "2026-06-26T12:00:00.000Z"
}
```

**Errors:** `400` invalid email / missing fields · `403` trial expired · `409` email already used on another device.

---

## 6. Submit a QC result

```
POST /api/qc-results
```

Ingests a complete QC report. **Requires `x-api-key`.** Also send the
`Authorization: Bearer <token>` from activation — it records the submitting
device/technician and is **mandatory for current clients** (legacy keyless submits
are rejected with `426`).

**Headers**
```
x-api-key: <shared-key>
Authorization: Bearer <token>
Content-Type: application/json
```

**Request body** (identifying fields enforced; deep detail blobs stored as-is)

| Field | Type | Required | Notes |
|---|---|---|---|
| `reportId` | string | ✅ | Unique report id from the client |
| `machineId` | string | ✅ | Device serial/identifier |
| `timestamp` | string | ✅ | ISO-8601 |
| `overallPass` | boolean | ✅ | |
| `overallScore` | number | – | |
| `overallGrade` | string | – | e.g. `A+` |
| `appVersion` | string | – | Client build; used for upgrade gating |
| `refurbishId` | string | – | Batch id |
| `technicianNotes` | string | – | |
| `technicianId` | number | – | |
| `systemInfo` | object | – | Arbitrary key/value snapshot |
| `testResults` | array | – | `{ testType, tested, passed, score?, grade?, message?, details?, timestamp? }` |
| `cpuDetails` / `ramDetails` / `storageDetails` / `batteryDetails` / `deviceDetails` | object | – | Stored as JSON |
| `pramaanScore` / `pramaanGrade` / `pramaanHash` / `healthId` / `pramaanCategoryScores` / `pramaanRiskFlags` / `pramaanAlgorithmVersion` | mixed | – | Health scoring outputs. **These wire names are frozen** for compatibility with deployed clients — the server stores them as `health_score` / `health_grade` / `health_hash` / `category_scores` / `risk_flags` / `scoring_algorithm_version` and maps them on ingest. Clients must keep sending the names in this column. |

Extra fields beyond this list are preserved.

```json
{
  "reportId": "RPT-2026-0001",
  "machineId": "SN123456",
  "timestamp": "2026-06-19T10:30:00Z",
  "appVersion": "1.4.0",
  "overallPass": true,
  "overallScore": 92,
  "overallGrade": "A",
  "testResults": [
    { "testType": "battery", "tested": true, "passed": true, "score": 95 }
  ],
  "systemInfo": { "os": "Ubuntu 24.04", "cpu": "Intel i7-1165G7" }
}
```

**201**
```json
{ "message": "QC result submitted successfully", "report_id": "RPT-2026-0001" }
```

**Errors:** `401` invalid API key · `426` client too old (must update) · `400` validation.

> A successful submit decrements the activating license where applicable.

---

## 7. Auto-update feed

The client polls for its platform and decides whether to update.

```
GET /api/updates/{platform}/latest?current={version}&channel={channel}
```

| Param | In | Notes |
|---|---|---|
| `platform` | path | `windows` \| `mac` \| `linux` (also `android` / `ios` for mobile) |
| `current` | query | Client's current version, e.g. `1.3.0`. Drives `updateAvailable`. |
| `channel` | query | `stable` (default) \| `beta` |

No auth. `Cache-Control: no-store`.

**200**
```json
{
  "platform": "linux",
  "channel": "stable",
  "version": "1.4.0",
  "updateAvailable": true,
  "mandatory": false,
  "notes": "Bug fixes and new battery test.",
  "kind": "file",
  "url": "https://<host>/api/updates/linux/download/57",
  "sha256": "9f86d08...",
  "size": 84561234,
  "fileName": "LaptopQC-1.4.0.AppImage",
  "publishedAt": "2026-06-15T08:00:00.000Z"
}
```

- `kind: "file"` → download the binary at `url`, verify `sha256`, then install.
- `kind: "store"` → `url` is an external store link (App/Play Store); open it instead.
- `mandatory: true` → force the update before continuing.
- `updateAvailable: false` → client is current; do nothing.

**404** if no release is published for that platform/channel yet.

### Download the installer

```
GET /api/updates/{platform}/download/{id}
```

Streams the installer for the release `id` learned from `/latest`. No auth.

Response headers include `X-Checksum-Sha256` (verify against the streamed bytes),
`Content-Length`, and `Content-Disposition` with the filename.

**Installer formats accepted per platform** (server-side validated on upload):

| Platform | Extensions |
|---|---|
| `windows` | `.exe`, `.msi` |
| `mac` | `.dmg`, `.pkg`, `.zip` |
| `linux` | `.AppImage`, `.deb`, `.rpm`, `.tar.gz` |

---

## 8. Recommended client flow

```
┌─ first run / no token ─────────────────────────────┐
│  POST /api/auth/license   (or /api/auth/trial)      │
│  → store { token, machineId }                       │
└─────────────────────────────────────────────────────┘
        │
        ▼
┌─ on startup ───────────────────────────────────────┐
│  GET /api/updates/{platform}/latest?current=<v>     │
│  → if updateAvailable: download, verify sha256,     │
│    install (force if mandatory)                     │
└─────────────────────────────────────────────────────┘
        │
        ▼
┌─ after each QC run ────────────────────────────────┐
│  POST /api/qc-results                               │
│    headers: x-api-key + Authorization: Bearer       │
│  → 201 stored  |  426 → force update                │
└─────────────────────────────────────────────────────┘
```

---

*Contact the backend team for the `x-api-key` value and license keys. Endpoint
contracts are generated from `lib/openapi/` — the in-dashboard reference is always
the live source of truth.*
