# API Guide (Integrations)

This section is for teams integrating Pramaan with other systems (internal tools, ERPs, asset tracking, automation scripts).

If you’re a dashboard user or technician, you usually do not need these docs.

---

## Who this is for

- Developers building integrations with Pramaan data (QC runs, machine history, users, licenses)
- Ops/IT teams scripting exports, audits, and reports

---

## API basics

### Base URL

- Production: `https://pramaan-dashboard.gadgetguruz.com/api`
- Local dev: `http://localhost:3000/api`

### Authentication (JWT)

Most endpoints require a bearer token:

`Authorization: Bearer <token>`

How to obtain a token:
- Staff/admin dashboards typically use `POST /api/auth/login` with username/password.
- Device/desktop/CLI clients can also use `POST /api/auth/login` with license+machine identity fields (depends on deployment rules).

### Public endpoints (no auth)

Common public endpoint:
- `GET /api/verify/:healthId` (certificate verification)

---

## Recommended approach: use the Postman collection

This repo includes a Postman collection you can import:

- `Pramaan.postman_collection.json`

Steps:
1. Import the collection into Postman.
2. Set a collection/environment variable for your base URL (e.g., `baseUrl`).
3. Call **Auth → Login** to get a token.
4. Configure the collection to send `Authorization: Bearer {{token}}` for protected routes.

If your team prefers cURL, see the examples below.

---

## Common integration use cases

### 1) Pull QC results for reporting

Use:
- `GET /api/qc-results` (list)
- `GET /api/qc-results/:id` (details)

Filters often used:
- `search` (serial/model/id)
- `hasIssues=true` (audit problem devices)

### 2) Track a machine over time

Use:
- `GET /api/machines` (list)
- `GET /api/machines/:id` (history + latest runs)

### 3) Programmatic verification (public)

Use:
- `GET /api/verify/:healthId`

### 4) User provisioning (admin roles)

Use:
- `GET /api/users`
- `POST /api/auth/register`
- `PUT /api/users/:id`

### 5) License operations (admin roles)

Use:
- `GET /api/licenses`
- `POST /api/licenses`
- `PATCH /api/licenses`

---

## cURL quick examples

### Login (username/password)

```bash
curl -sS -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"admin","password":"yourpassword"}'
```

### List QC results (authorized)

```bash
curl -sS "$BASE_URL/qc-results?limit=20&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

### Public verify

```bash
curl -sS "$BASE_URL/verify/$HEALTH_ID"
```

---

## Full endpoint reference

The full internal endpoint reference (with request/response shapes) lives here:

- `docs/engineering/api-reference.md`

If you want this end-user API guide to include the full endpoint-by-endpoint specification as well (instead of linking to engineering docs), say so and I’ll duplicate/reframe it into an “External API Reference” format.

