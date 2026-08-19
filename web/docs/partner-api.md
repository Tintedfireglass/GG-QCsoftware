# Partner API — Quickstart

Read and manage your QC results, machines, licenses, team and fleet from your own
backend. Everything under `/api/partner/v1/*`.

- **Interactive reference:** `https://<host>/docs/api`
- **OpenAPI spec:** `https://<host>/api/partner/v1/openapi.json` (public — feed it to Postman or a code generator)
- **Postman collection:** [PRAMAAN_Partner_API.postman_collection.json](PRAMAAN_Partner_API.postman_collection.json)

---

## 1. Authentication

Your account manager issues you a key. It is shown **once**, at creation — store it
in your secret manager, not in source control. If it is lost, it is replaced, not
recovered.

```bash
curl https://<host>/api/partner/v1/me \
  -H "x-api-key: pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

```json
{
  "account": { "id": 42, "username": "acme", "role": "Reseller" },
  "key": { "id": 7, "scopes": ["qc:read", "machines:read"], "rateLimitPerMin": 120 }
}
```

`Authorization: Bearer pk_live_…` works identically. Keys in the query string are
rejected — they leak into access logs and referrers.

Call `/me` first: it needs no scope and tells you exactly what your key can do.

### What a key can see

A key acts as the account that owns it, with the same visibility that account has
when signed into the dashboard: **its own records, plus those of the users it
created.** There is no parameter that widens this.

## 2. Scopes

A key carries a fixed set of scopes. Missing one returns `403` naming it.

| Scope | Grants |
|---|---|
| `qc:read` | QC results, counts, issue and asset-health summaries |
| `qc:write` | Hide a QC result |
| `machines:read` | Machines and their history |
| `machines:write` | Rename a machine |
| `licenses:read` | List license keys |
| `licenses:write` | Generate, toggle and re-date keys — **spends license credits** |
| `users:read` | List and read team members |
| `users:write` | Create, update and deactivate team members |
| `fleet:read` | Fleet inventory and lifecycle events |
| `fleet:write` | Enrol machines, add lifecycle events |
| `reports:read` | Exports and mobile QC reports |

Some endpoints are additionally limited by account type: license and team
management need Reseller, Refurbisher or Enterprise; fleet needs Reseller or
Enterprise. The reference marks these.

## 3. Rate limits

Every response carries:

```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 118
X-RateLimit-Reset: 1787074750     # unix seconds
```

Over the limit returns `429` with `Retry-After` in seconds. Back off; do not retry
in a tight loop. Ask us if your integration needs a higher ceiling — it is set per key.

## 4. Errors

Non-2xx responses are always:

```json
{ "error": "Authorization Error", "message": "This API key is missing the licenses:read scope" }
```

| Status | Meaning |
|---|---|
| `400` | Invalid parameters — `message` says which |
| `401` | Key missing, invalid, revoked or expired |
| `403` | Key lacks the scope, or the account type is not permitted |
| `404` | Not found, or outside your visibility |
| `429` | Rate limited |
| `500` | Our fault — retry with backoff, then contact us |

## 5. Pagination

QC results and machines use `limit`/`offset`; licenses and users use `page`/`limit`.
Both return a `pagination` object:

```json
{ "results": [ … ], "pagination": { "total": 170, "limit": 50, "offset": 0, "hasMore": true } }
```

Max page size is 200 for QC results and users, 100 for licenses and mobile reports.

`pagination.total` is the count **for your filters** — use it rather than
`/qc-results/count`, which is a lifetime total that ignores date, `since` and
retention filters.

## 6. Incremental sync

Do not re-download everything on a schedule. Pass `since` — an ISO timestamp — and
sort ascending:

```bash
curl "https://<host>/api/partner/v1/qc-results?since=2026-08-18T10:00:00Z&sort=date_asc&limit=200" \
  -H "x-api-key: $PRAMAAN_KEY"
```

Store the `timestamp` of the last row you processed and use it as the next `since`.

`since` is **inclusive**, so the boundary row can repeat — de-duplicate on `id`.
That is deliberate: an exclusive bound would silently drop results sharing a
timestamp across a page edge, and a duplicate is cheaper than a missing report.

`since` also lifts the default retention window, so an old cursor still returns
everything after it.

## 7. Endpoints

| Method | Path | Scope |
|---|---|---|
| GET | `/me` | — |
| GET | `/qc-results` · `/count` · `/{id}` | `qc:read` |
| GET | `/qc-results/issues-summary` · `/asset-health` | `qc:read` |
| DELETE | `/qc-results/{id}` | `qc:write` |
| GET | `/qc-results/export?format=xlsx\|pdf` | `reports:read` |
| GET | `/machines` · `/count` · `/{id}` | `machines:read` |
| PATCH | `/machines/{id}` | `machines:write` |
| GET | `/licenses` | `licenses:read` |
| POST | `/licenses` · PATCH `/licenses/{id}` | `licenses:write` |
| GET | `/users` · `/{id}` | `users:read` |
| POST | `/users` · PATCH/DELETE `/users/{id}` | `users:write` |
| GET | `/fleet` · `/fleet/{machineId}/lifecycle` | `fleet:read` |
| POST | `/fleet` · `/fleet/{machineId}/lifecycle` | `fleet:write` |
| GET | `/mobile-reports` · `/{reportId}` | `reports:read` |

Full parameters, bodies and examples are in the interactive reference.

## 8. Webhooks

Rather than polling, register an endpoint and we POST each event to it as it
happens. Ask your account manager to add one; you will be given a signing secret
**once**.

### Events

| Event | Fires when |
|---|---|
| `qc_result.created` | One of your technicians submits a QC report |
| `license.activated` | One of your license keys is activated on a new device |
| `machine.enrolled` | A machine is enrolled into your fleet |

You only receive events for records you could already read through the API.

### Request

```http
POST /your/endpoint
Content-Type: application/json
X-Webhook-Event: qc_result.created
X-Webhook-Timestamp: 1787074750
X-Webhook-Signature: t=1787074750,v1=6f3c…
```

```json
{
  "event": "qc_result.created",
  "sentAt": "2026-08-18T12:14:03.221Z",
  "data": {
    "id": 2239,
    "reportId": "ea97b49a-4888-4fca-94c3-e211b318739e",
    "machineId": "1N1505096P",
    "overallPass": false,
    "overallScore": 99,
    "overallGrade": "A+",
    "timestamp": "2026-08-06T10:59:31Z"
  }
}
```

### Verifying the signature

Compute HMAC-SHA256 over `` `${timestamp}.${rawBody}` `` with your secret and compare
it to `v1`. Use the **raw** body, before JSON parsing, and compare in constant time.

```js
const crypto = require('crypto')

function verify(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')))
  // Reject anything older than five minutes, so a captured request cannot be replayed.
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${parts.t}.${rawBody}`)
    .digest('hex')

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
}
```

### Delivery rules

- **Answer 2xx** as soon as you have stored the event. We wait at most 5 seconds.
- **Retries:** 5 attempts total, backing off 1m → 5m → 30m → 2h.
- **At-least-once:** a retry after a slow 2xx means the same event can arrive twice.
  De-duplicate on `data.id` + `event`.
- **Auto-disable:** 20 consecutive failures disables the endpoint; we will tell you,
  and it is re-enabled by your account manager once fixed.
- Every attempt is logged, so ask if you believe you missed something.

## 9. Browser access (CORS)

Off by default, and it should usually stay off: a key used from a browser is
visible to anyone who opens the page. If you must call from the browser, your
account manager can register specific origins on the key, and only those origins
receive CORS headers. Otherwise, call from your backend.

## 10. Notes for production

- **Server-to-server by default.** Unless origins are registered on your key (§9),
  no CORS headers are sent and browser calls will fail. Proxy through your backend.
- **HTTPS only.**
- **Revocation is immediate.** A revoked key starts failing with `401` at once.
- **Versioned path.** Breaking changes land on a new prefix (`/v2`), never on `/v1`.

## 11. Changelog

| Version | Change |
|---|---|
| v1 | Initial release: QC results, machines, licenses, users, fleet, mobile reports, webhooks. |
