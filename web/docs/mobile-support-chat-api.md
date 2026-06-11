# Support Ticket Chat — Mobile API Contract

This document describes **new backend endpoints** added to the PRAMAAN dashboard/API
that let a mobile app user have a **two-way conversation** with support on an existing
ticket. Previously the app could only *create* a ticket and *list* its own tickets; now
the customer can read admin replies and send follow-up messages.

Give this file to the app project so the chat UI can be built against the new endpoints.

---

## Summary of what changed

- A new conversation thread exists per ticket. Each message has a `sender` of either
  `"admin"` (support staff) or `"customer"` (the app user).
- **Two new mobile endpoints** (below).
- **One existing endpoint changed**: the ticket list now includes a `messageCount` field
  per ticket (use it to show a "new replies" indicator).
- Nothing existing was removed — ticket creation and listing are unchanged otherwise.

---

## Auth & envelope (unchanged from existing mobile API)

- All requests require the customer bearer token:
  `Authorization: Bearer <customer JWT>` (same token used for the other mobile endpoints).
- Success envelope: `{ "success": true, "message"?: string, "data"?: object }`
- Error envelope: `{ "success": false, "error": { "code": string, "message": string, "details"?: [...] } }`
- A request scoped to a ticket the customer does **not** own returns `404 NOT_FOUND`
  (tickets are always scoped to the authenticated customer; never trust a client-supplied
  customer id).

The `{ticketId}` in the paths below is the **public ticket id string** (e.g. `tkt_a1b2c3d4e5f6`),
i.e. the same `ticketId` returned when creating a ticket and in the ticket list — NOT a numeric id.

---

## 1. Get conversation for a ticket

```
GET /api/mobile/support/tickets/{ticketId}/messages
```

**Response 200**

```json
{
  "success": true,
  "data": {
    "ticketId": "tkt_a1b2c3d4e5f6",
    "status": "in_progress",
    "messages": [
      {
        "id": 12,
        "sender": "customer",
        "message": "App crashes when I scan.",
        "createdAt": "2026-06-10T09:12:00.000Z"
      },
      {
        "id": 18,
        "sender": "admin",
        "message": "Thanks — which Android version are you on?",
        "createdAt": "2026-06-10T10:01:00.000Z"
      }
    ]
  }
}
```

Notes:
- `messages` is ordered **oldest → newest** (ascending by `createdAt`). Render bottom of list = newest.
- `sender: "admin"` = support staff (show on the left / "Support"); `sender: "customer"` =
  this app user (show on the right / "You").
- The thread does **not** include the original ticket `subject`/`message` — that still comes
  from the ticket object itself (creation response / ticket list). Show the original ticket
  message as the first bubble if you want the full context, then the `messages` thread below it.
- An empty `messages` array (`[]`) just means no replies yet.
- `status` is the current ticket status: `open` | `in_progress` | `resolved` | `closed`.

**Errors**
- `404 NOT_FOUND` — ticket doesn't exist or doesn't belong to this customer.
- `401 UNAUTHORIZED` — missing/invalid token.

---

## 2. Send a message (customer reply)

```
POST /api/mobile/support/tickets/{ticketId}/messages
Content-Type: application/json
```

**Request body**

```json
{ "message": "I'm on Android 13." }
```

- `message`: required, trimmed, **1–4000 characters**.

**Response 201**

```json
{
  "success": true,
  "message": "Message sent",
  "data": {
    "id": 23,
    "ticketId": "tkt_a1b2c3d4e5f6",
    "createdAt": "2026-06-10T10:05:00.000Z"
  }
}
```

After a successful POST, either append the new message locally (you have `id` + `createdAt`,
`sender` is `"customer"`, `message` is what you sent) or re-fetch the thread via endpoint #1.

**Errors**
- `400 VALIDATION_ERROR` — empty message or longer than 4000 chars. `error.details` carries
  field-level info, e.g. `[{ "field": "message", "message": "Message is required" }]`.
- `409 TICKET_CLOSED` — the ticket has been **closed** by support; no further replies are
  allowed. Show a message like "This ticket is closed — please raise a new ticket." and
  hide/disable the input. (Note: `resolved` tickets CAN still receive replies; only `closed`
  is blocked.)
- `404 NOT_FOUND` — ticket doesn't exist or isn't this customer's.
- `401 UNAUTHORIZED` — missing/invalid token.

---

## 3. Ticket list — new field

```
GET /api/mobile/support/tickets   (existing endpoint, unchanged path & paging)
```

Each ticket object in `data.tickets[]` now has an extra field:

```jsonc
{
  "ticketId": "tkt_a1b2c3d4e5f6",
  "subject": "...",
  "category": "...",
  "message": "...",          // original ticket message
  "status": "in_progress",
  "priority": "normal",
  "messageCount": 3,          // <-- NEW: number of conversation messages on this ticket
  "createdAt": "...",
  "updatedAt": "..."          // bumped whenever a new message is added (either side)
}
```

- `messageCount` = total messages in the conversation thread (admin + customer combined),
  **not** counting the original ticket body. `0` means no replies/messages yet.
- Use `messageCount > 0` to show a "has conversation" badge. If you want an unread indicator,
  track the last-seen count/`updatedAt` locally per ticket (the API does not track read state).

---

## Suggested app behaviour

- Ticket detail screen: show ticket header (subject, status, priority) → original message →
  conversation thread (#1) → reply composer (#2).
- Poll endpoint #1 (or re-fetch on screen focus / pull-to-refresh) to pick up new admin
  replies — there is no push/websocket on this contract.
- Disable the composer when `status === "closed"` and rely on the `409 TICKET_CLOSED`
  guard as a backstop.
- Validate message length (1–4000) client-side before POSTing to avoid a round-trip 400.

---

## Quick reference

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/api/mobile/support/tickets/{ticketId}/messages` | Fetch conversation thread |
| POST   | `/api/mobile/support/tickets/{ticketId}/messages` | Customer sends a message |
| GET    | `/api/mobile/support/tickets` | List tickets (now includes `messageCount`) |

All under the existing mobile API base URL, with the existing customer bearer token.
