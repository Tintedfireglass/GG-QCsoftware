# PRAMAAN Mobile — Support Tickets API

Integration notes for the Android app's **Contact Support** feature. Backs the `support/contact` endpoint from `PRAMAAN_Mobile_API.postman_collection.json` (previously "Doc only") plus a new ticket-history endpoint.

- **Base URL:** `https://pramaan-dashboard.gadgetguruz.com` (same as the rest of the mobile API).
- **Auth:** customer JWT — `Authorization: Bearer <token>` is **required** on both endpoints (same 30-day token used elsewhere). A missing/invalid token returns `401 UNAUTHORIZED`.
- **Envelope:** standard mobile envelope.
  - success → `{ "success": true, "message"?, "data"? }`
  - error → `{ "success": false, "error": { "code", "message", "details"? } }`
- **Status:** Backend **live**. Client wiring pending.

---

## 1. Create a ticket

`POST /api/mobile/support/contact`

### Request body
| Field | Type | Required | Constraints |
|---|---|---|---|
| `subject` | string | ✅ | 3–160 chars |
| `message` | string | ✅ | 5–4000 chars |
| `category` | string | optional | ≤ 80 chars (free text, e.g. `"Billing"`, `"Technical"`) |
| `deviceId` | string | optional | ≤ 120 chars — the same device id sent elsewhere |
| `appVersion` | string | optional | ≤ 40 chars |

```json
{
  "subject": "App crashes on battery test",
  "message": "Every time I start the battery test the app closes.",
  "category": "Technical",
  "deviceId": "a1b2c3d4e5",
  "appVersion": "1.4.2"
}
```

### Success — `201 Created`
```json
{
  "success": true,
  "message": "Support ticket created",
  "data": {
    "ticketId": "tkt_9f3a1c8b2d4e",
    "status": "open",
    "createdAt": "2026-06-09T10:15:00.000Z"
  }
}
```

### Validation error — `400 VALIDATION_ERROR`
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Subject is required",
    "details": [{ "field": "subject", "message": "Subject is required" }]
  }
}
```

---

## 2. List my tickets

`GET /api/mobile/support/tickets?page=1&limit=20`

Returns the authenticated customer's own tickets, newest first.

### Query params
| Param | Default | Notes |
|---|---|---|
| `page` | `1` | clamped to ≥ 1 |
| `limit` | `20` | clamped to 1–100 |

(Invalid/garbage values are clamped, not rejected.)

### Success — `200 OK`
```json
{
  "success": true,
  "data": {
    "tickets": [
      {
        "ticketId": "tkt_9f3a1c8b2d4e",
        "subject": "App crashes on battery test",
        "category": "Technical",
        "message": "Every time I start the battery test the app closes.",
        "status": "in_progress",
        "priority": "high",
        "createdAt": "2026-06-09T10:15:00.000Z",
        "updatedAt": "2026-06-09T11:02:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

---

## 3. Enums

`status` and `priority` are managed by the support team in the admin dashboard. The app should treat them as read-only display values.

| `status` | meaning |
|---|---|
| `open` | newly created (default) |
| `in_progress` | being worked on |
| `resolved` | fixed/answered |
| `closed` | done, no further action |

| `priority` | |
|---|---|
| `low` / `normal` / `high` | `normal` is the default |

---

## 4. Client integration notes

- **Create flow:** the existing "Contact Support" button (currently unwired) should `POST` to `/support/contact`. On `201`, show the returned `ticketId` as confirmation.
- **History (optional):** `GET /support/tickets` lets you add a "My tickets" screen later. There is no per-ticket detail endpoint and no in-app reply thread yet — the support team replies out-of-band (e.g. by email). Ask backend if you need a ticket-detail or messaging endpoint.
- **Suggested DTOs** (nullable + `ignoreUnknownKeys`, matching the app's existing convention):

```kotlin
@Serializable
data class CreateTicketRequest(
    val subject: String,
    val message: String,
    val category: String? = null,
    val deviceId: String? = null,
    val appVersion: String? = null,
)

@Serializable
data class CreateTicketData(
    val ticketId: String? = null,
    val status: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class SupportTicketDto(
    val ticketId: String? = null,
    val subject: String? = null,
    val category: String? = null,
    val message: String? = null,
    val status: String? = null,
    val priority: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)
```

---

## 5. Admin side (FYI, not called by the app)

Tickets land in the dashboard at **Support** (SuperAdmin), where staff can filter/search, set `status`/`priority`, add an internal note, and reply by email. Endpoints: `GET /api/admin/support`, `PATCH /api/admin/support/{id}`, `DELETE /api/admin/support/{id}`.

> **Deploy note:** requires migration `drizzle/manual/0016_support_tickets.sql` to be applied to the database.
