# Partner (Reseller) API — Implementation Plan

Goal: let resellers drive their own frontends/backends against our platform, with the same data
scoping their dashboard already enforces.

## Core design decision

**New namespace `/api/partner/v1/*` whose routes are thin wrappers over the existing services.**

Two facts make this cheap:

1. Every service function already takes `AuthenticatedUser` as its first argument
   (`listResults(user, q)`, `generateLicense(user, input)`, `listFleet(user, q)` …), and row
   visibility is centralised in `ownerVisibilitySql()` (`lib/shared/domain/visibility.ts`), where
   `Reseller` is already a `TEAM_ROLE`. A reseller principal therefore sees only its own rows plus
   its created users' rows. **No new authorization logic is needed.**
2. `withAuth` already accepts a pluggable `Authenticator` (`lib/http/handler.ts`), with a comment
   explicitly anticipating "a partner audience later".

So the partner API = *auth adapter + rate limiter + route shims + docs*. No business-logic
duplication, and internal `/api/*` URLs stay free to evolve (honours the API-route-freeze rule).

---

## 1. Data model

New migration `drizzle/manual/0029_partner_api_keys.sql` (repo convention: hand-written SQL with
`IF NOT EXISTS`, then reflect into `drizzle/schema.ts`).

```sql
CREATE TABLE IF NOT EXISTS partner_api_keys (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,                 -- human label, e.g. "Acme prod backend"
  key_prefix         VARCHAR(16) NOT NULL,          -- shown in UI: pk_live_a1b2c3
  key_hash           TEXT NOT NULL,                 -- sha256 of the full key
  scopes             TEXT[] NOT NULL DEFAULT '{}',
  rate_limit_per_min INTEGER NOT NULL DEFAULT 120,
  allowed_origins    TEXT[] NOT NULL DEFAULT '{}',  -- empty = server-to-server only
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at         TIMESTAMP,
  last_used_at       TIMESTAMP,
  revoked_at         TIMESTAMP,
  created_by         INTEGER REFERENCES users(id),
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_api_keys_hash ON partner_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_partner_api_keys_user ON partner_api_keys(user_id);
```

Key format: `pk_live_<32 chars base62>` (`pk_test_` for sandbox). Only the SHA-256 is stored; the
full key is displayed **once**, at creation.

## 2. Auth layer

| File | Responsibility |
|---|---|
| `lib/shared/repositories/partner-keys.repo.ts` | CRUD + `findActiveByHash` |
| `lib/shared/services/partner-keys.service.ts` | issue / list / revoke, authorised via `canManageUser` |
| `lib/http/partner-auth.ts` | `partnerAuth: Authenticator` + `withPartner(scopes, handler)` |

Resolution flow: read `X-API-Key` (also accept `Authorization: Bearer pk_…`) → SHA-256 → look up an
active, non-revoked, non-expired row → load the owning user (must be `is_active`, role in
`PARTNER_ROLES = ['Reseller','Refurbisher','Enterprise','OEM','Insurer']`) → return
`AuthenticatedUser`. Update `last_used_at` fire-and-forget, throttled to ~1/min.

`AuthenticatedUser` carries no scopes, so `withPartner` extends `RouteContext` with `{ apiKey }` and
gates before invoking the handler:

```ts
export const GET = withPartner(['qc:read'], async (req, { user }) =>
    json(await listResults(user, parseListQuery(req))));
```

Scopes: `qc:read` `qc:write` `machines:read` `machines:write` `licenses:read` `licenses:write`
`users:read` `users:write` `fleet:read` `fleet:write` `reports:read`.

**Hard rule:** partner auth must never resolve to a `GLOBAL_ROLE` (`SuperAdmin` / `Employee`) — deny
outright, so a leaked key can never yield platform-wide visibility.

## 3. Rate limiting (currently nonexistent anywhere in the codebase)

`lib/http/rate-limit.ts` — token bucket keyed by API key id, falling back to `clientIp(request)`
(helper already exists in `lib/http/handler.ts`). In-process `Map` to start (single Node process);
keep the interface storage-agnostic so a Redis/Postgres backend drops in later.

- Limit read from `rate_limit_per_min` on the key row.
- `X-RateLimit-Limit` / `-Remaining` / `-Reset` headers on every partner response.
- Add `TooManyRequestsError` (429) to `lib/http/errors.ts`, applied inside `withPartner` so every
  partner route inherits it.
- Follow-up: apply the same limiter to `/api/auth/login` and `/api/mobile/auth/request-otp`.

## 4. Endpoint surface (v1)

Each route is a shim; the right-hand column is the existing function it calls unchanged.

| Endpoint (under `/api/partner/v1`) | Scope | Delegates to |
|---|---|---|
| `GET /me` | — | key + user summary |
| `GET /qc-results` · `/count` · `/{id}` | `qc:read` | `listResults` · `countResults` · `getResultDetail` |
| `GET /qc-results/issues-summary` · `/asset-health` | `qc:read` | `issuesSummary` · `assetHealthSummary` |
| `POST /qc-results/export` | `reports:read` | `exportQcResults` |
| `GET /machines` · `/{id}` · `PATCH /{id}` | `machines:*` | `listMachines` · `getMachineDetails` · `renameMachine` |
| `GET /licenses` · `POST /licenses` | `licenses:*` | `listLicenses` · `generateLicense` |
| `PATCH /licenses/{key}/toggle` · `/expiry` | `licenses:write` | `toggleLicense` · `updateLicenseExpiry` |
| `GET /users` · `/{id}` · `POST` · `PATCH` · `DELETE` | `users:*` | `listUsers` · `getUser` · register · `updateUser` · `deactivateUser` |
| `GET /fleet` · `POST /fleet` · `GET`/`POST /fleet/{id}/lifecycle` | `fleet:*` | `listFleet` · `enrollMachine` · `getLifecycle` · `addLifecycleEvent` |
| `GET /mobile-reports` · `/{id}` | `reports:read` | `listAdminReports` · `getAdminReport` |
| `GET /verify/{health_id}` | public | existing verify service |

Conventions: keep the platform's existing shapes — plain JSON on success, `{ error, message }` on
failure. Do **not** invent a new envelope. Enforce a max page size (200) on partner list calls, and
expose a `since` cursor on `/qc-results` so partners poll incrementally instead of refetching.

## 5. Admin UI

- SuperAdmin: `app/dashboard/users/[id]` → new **API Access** panel — issue key (name, scopes, rate
  limit, expiry, allowed origins), list keys with prefix / last-used, revoke.
- Reseller self-serve (phase 2): `app/dashboard/settings` → API Keys, gated by an
  `allow_partner_api` flag on `users` so it stays opt-in per reseller.
- Full key shown once, with a copy button and an explicit "you will not see this again" warning.

## 6. Documentation

The hard part already exists — an OpenAPI 3.1 builder (`lib/openapi/`) rendered by Scalar at
`app/dashboard/api-reference`. Remaining work:

1. `lib/openapi/paths/partner.ts` + a `Partner API` tag in `lib/openapi/document.ts`.
2. New `partnerApiKey` security scheme in `lib/openapi/security.ts`.
3. Publish the spec: `GET /api/partner/v1/openapi.json` (unauthenticated) and a public docs page
   (`/docs/api`) reusing `ApiReferenceClient`. Brand it from System Settings — nothing hardcoded.
4. `docs/partner-api.md` quickstart: auth, first call, error codes, rate limits, pagination,
   changelog — plus a Postman collection alongside the mobile one.
5. While in there: `fleet`, `machine-history` and `admin/mobile-reports` are missing from the
   existing spec; add them.

## 7. CORS

Default **server-to-server only** (no CORS headers; the key never leaves the reseller's backend). If
a reseller must call from the browser, use `allowed_origins` on the key row: an `OPTIONS` handler
echoes the origin only when allow-listed. Never `*` alongside API keys.

## 8. Webhooks (phase 3, on demand only)

`partner_webhooks` (url, secret, events[], is_active). Events: `qc_result.created`,
`license.activated`, `machine.enrolled`. HMAC-SHA256 signature header + timestamp, retry with
backoff, delivery log. Polling with a `since` cursor covers most needs first — do not build this
speculatively.

## 9. Security checklist

- Keys hashed at rest; redact `x-api-key` and `pk_*` in `lib/logger.ts`.
- Revocation effective immediately (no cache beyond ~10s).
- Reject keys passed in query strings; HTTPS only.
- Audit every partner call: key id, route, status, ip.
- `lib/auth.ts:4` still falls back to `'your-secret-key-change-in-production'` for `JWT_SECRET`, and
  `API_KEY` is a single shared desktop secret — **verify both are set in the prod environment before
  exposing anything externally.**
- License generation spends `license_credits`; keep `licenses:write` off by default.

## 10. Rollout

| Phase | Contents | Status |
|---|---|---|
| **P1** | migration + key model/service + `partnerAuth` + rate limiter + read endpoints (qc-results, machines, licenses, mobile-reports) + admin key UI + OpenAPI entries | **Done** |
| **P2** | write endpoints (license generate/toggle, users, fleet) + public docs page + Postman collection + `since` cursor | **Done** |
| **P3** | webhooks, per-key CORS, per-key usage analytics | **Done** |

P3 notes:

- **Webhooks** are emitted fire-and-forget from the service that causes them
  (`emitPartnerEvent`), never awaited, so a reseller's endpoint can never slow or
  fail a QC submission. `license.activated` is captured inside the transaction but
  emitted only after it commits.
- **Retries** have no queue worker to drive them, so `POST /api/admin/partner-webhooks/retry`
  is the sweep — point a scheduler at it, the same way `/api/admin/renewals/run` works.
- **Usage** is buffered in memory and flushed as aggregated upserts every 30s.
  A process restart loses at most that window; it feeds an admin panel, not billing.
- **CORS preflights** carry no API key, so they are answered from the set of origins
  registered across all live keys. The real request still has to match its own key's
  origins, so nothing is granted by the preflight itself.

Two things landed differently from the plan above:

- **Export is `GET /qc-results/export`**, not POST — it mirrors the existing dashboard
  endpoint, which takes its filters from the query string and streams a file back.
- **`/qc-results/count` is a lifetime total.** The underlying service never applied
  date filters to it (pre-existing dashboard behaviour), so rather than change what
  the dashboard counts, the partner spec documents it as such and points integrators
  at `pagination.total` for a filtered count.

The docs page lives in this app (`/docs/api`) because the spec is generated from
`lib/openapi/` at request time and therefore cannot drift. The store website links
to it rather than hosting its own copy.

## Open decisions (defaults assumed unless overridden)

1. **Who mints keys** — default: SuperAdmin only; reseller self-serve in P2.
2. **Browser access** — default: server-to-server only; per-key CORS in P3.
3. **Write access** — default: read-only scopes at launch; `licenses:write` / `users:write` granted
   per reseller on request.
4. **Default rate limit** — 120 req/min per key.
5. **Webhooks** — not in P1; polling with `since`.
