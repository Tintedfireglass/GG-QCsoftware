# QC Software Architecture

Multi-platform quality control system. Windows (laptop/PC) is the established product; Android (mobile) is the newer product. Both share user management, licensing, payments, and commerce infrastructure.

## Overview

A unified Next.js (App Router) application that serves three audiences from one codebase:

- **Desktop/mobile QC apps** — submit QC results and validate licenses over the API.
- **Admin dashboard** (`/dashboard`) — internal management of machines, results, users, licenses, commerce.
- **B2C customers** (`/customer` + the separate `store-website/` app) — buy licenses and manage their account.

## Core Principles

1. **Platform separation** — Windows and Android domain/repo/service code live in isolated modules under `lib/platforms/`.
2. **Shared infrastructure** — auth, users, licenses, customers, payments, email, SMS, analytics, and other commerce concerns are common across platforms in `lib/shared/`.
3. **Layered architecture** — Domain → Repository → Service → API → UI. `qc-results` is the reference implementation.
4. **API URL freeze** — existing PC/desktop `/api/*` URLs never move or rename (clients are deployed in the field). New products get new namespaces (e.g. `/api/mobile/*`).
5. **Convention over configuration** — follow Next.js patterns, keep route handlers thin.

## Project Structure

```
web/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes (thin handlers → services)
│   │   ├── machines/             # Windows: laptop inventory  (FROZEN URL)
│   │   ├── qc-results/           # Windows: QC results + export/count/issues
│   │   ├── fleet/                # Windows: fleet management
│   │   ├── machine-history/      # Windows: lifecycle events + alerts
│   │   ├── pramaan/              # Windows: Pramaan scoring config
│   │   ├── verify/               # Public: health report verification
│   │   │
│   │   ├── mobile/               # Android product namespace
│   │   │   ├── auth/             #   phone + OTP auth (signup/login/otp/forgot)
│   │   │   ├── device/           #   device info
│   │   │   ├── license/          #   activate / status
│   │   │   ├── reports/          #   fullqc / stress / test / history
│   │   │   └── user/             #   profile / account / change-password
│   │   │
│   │   ├── auth/                 # Shared: admin auth (login/register/license/trial)
│   │   ├── users/                # Shared: admin user management (+ me, stats)
│   │   ├── licenses/             # Shared: license management
│   │   ├── customer/             # Shared: B2C portal (auth, checkout, payment, plans, coupons, licenses, me)
│   │   ├── public/               # Shared: unauthenticated store endpoints (checkout, coupon)
│   │   ├── plans/                # Shared: public plan listing
│   │   ├── contact/              # Shared: contact form intake
│   │   ├── track/                # Shared: analytics event ingestion
│   │   ├── updates/[platform]/   # Shared: desktop/app auto-update (latest, download)
│   │   ├── server-health/        # Shared: health check
│   │   └── admin/                # Shared: admin-only operations
│   │       ├── analytics/        #   analytics overview
│   │       ├── coupons/  orders/  plans/  renewals/
│   │       ├── payment-gateways/ settings/
│   │       ├── email/            #   providers / templates / test
│   │       ├── sms/              #   providers / test
│   │       ├── releases/         #   app-update release management
│   │       ├── contacts/  free-trials/
│   │
│   ├── dashboard/                # Admin dashboard (UI)
│   │   ├── machines/  results/  fleet/         # Windows QC
│   │   ├── users/  licenses/  free-trials/     # access & licensing
│   │   ├── orders/  plans/  coupons/  payment-gateways/   # commerce
│   │   ├── email/  sms/  settings/             # config
│   │   ├── releases/                           # app updates
│   │   ├── analytics/  contacts/               # ops
│   │   ├── api-reference/  docs/               # internal docs
│   │
│   ├── customer/                 # B2C customer portal (account, login, register, checkout-complete)
│   ├── login/                    # Admin login
│   ├── wiki/                     # Public documentation
│   ├── verify/                   # Health report verification page
│   └── report/                   # Public QC report pages
│
├── lib/                          # Business logic
│   ├── platforms/
│   │   ├── windows/              # Windows (laptop/PC) QC module
│   │   │   ├── domain/
│   │   │   │   ├── fingerprint.ts
│   │   │   │   └── schemas/  (machines, qc-results, fleet, machine-history)
│   │   │   ├── repositories/  (machines, qc-results, fleet, machine-history)
│   │   │   ├── services/      (machines, qc-results, qc-export, fleet, machine-history)
│   │   │   ├── grades.ts  issues.ts  machine-status.ts
│   │   │
│   │   └── android/             # Android (mobile) QC module
│   │       ├── domain/schemas/mobile.ts
│   │       ├── http.ts          # mobile-specific request helpers
│   │       ├── repositories/  (mobile-auth, mobile-device, mobile-license, mobile-reports)
│   │       └── services/      (mobile-auth, mobile-device, mobile-license, mobile-reports)
│   │
│   ├── shared/                  # Cross-platform infrastructure
│   │   ├── domain/
│   │   │   ├── schemas/  (auth, users, licenses, customer, plans, coupons,
│   │   │   │              releases, contact, analytics, public-checkout)
│   │   │   ├── version.ts  visibility.ts
│   │   ├── repositories/        # auth, users, licenses, customer, free-trials,
│   │   │                        # pramaan, server-health, plans, coupons, orders,
│   │   │                        # renewals, releases, contact, analytics, settings,
│   │   │                        # payment-gateway, email-provider, email-template, sms-provider
│   │   ├── services/            # matching service layer for the repos above
│   │   ├── payment/             # gateway.interface + factory + razorpay.gateway
│   │   ├── email/               # mailer + template-registry
│   │   ├── sms/                 # sms-sender + provider-specs
│   │   ├── analytics/           # parse.ts
│   │   └── storage/             # releases-storage.ts (local-disk artifact storage)
│   │
│   ├── http/                    # handler.ts, errors.ts, validate.ts, customer-auth.ts
│   ├── openapi/                 # OpenAPI document builder + per-area path specs
│   │
│   ├── db.ts  drizzle.ts        # DB connection + Drizzle ORM
│   ├── auth.ts  auth-middleware.ts  customer-auth.ts  customer-checkout.ts
│   ├── api.ts  analytics-client.ts  client-cache.ts
│   ├── license-key.ts  logger.ts  types.ts  utils.ts
│
├── components/                  # React components
│   ├── ui/                      # base UI primitives
│   ├── wiki/                    # wiki components
│   ├── api-reference/           # API reference UI
│   ├── sidebar.tsx  mobile-sidebar.tsx
│   ├── auth-provider.tsx  analytics-tracker.tsx
│
├── drizzle/                     # Drizzle ORM
│   ├── schema.ts                # Database schema (SOURCE OF TRUTH)
│   ├── relations.ts             # Table relations
│   ├── manual/                  # Hand-written SQL
│   └── 0000_*.sql               # Generated migrations
│
├── scripts/                     # Utility scripts (backup-db, fix-sequences, SQL helpers)
├── store-website/               # Separate public storefront Next.js app (own deps/build)
└── public/                      # Static assets
```

## Architecture Layers

### 1. Domain Layer (`lib/{platforms/<os>|shared}/domain/`)
- Zod schemas for validation
- TypeScript types, business constants
- No dependencies on other layers

### 2. Repository Layer (`.../repositories/`)
- Direct database access via Drizzle ORM
- CRUD + query builders, returns plain objects

### 3. Service Layer (`.../services/`)
- Business logic, data transformation, orchestrates repositories
- Implements use cases (e.g. `qc-export.service.ts`)

### 4. API Layer (`app/api/`)
- Thin HTTP handlers: authenticate, validate, call a service, return JSON
- Shared helpers live in `lib/http/` (handler, errors, validate, customer-auth)

### 5. UI Layer (`app/dashboard/`, `app/customer/`, `components/`)
- React components; Server Components by default
- Calls APIs via fetch

## Data Flow

```
Request → API route (app/api/) → auth middleware → service (lib/.../services/)
        → repository (lib/.../repositories/) → PostgreSQL
        → repo returns data → service enriches → API returns JSON → UI renders
```

## Platform Modules

### Windows Module (`lib/platforms/windows/`)
**Purpose**: laptop/PC quality control testing.

**Tables**: `machines`, laptop `qc_results` / `test_results`, `machine_history`, `fleet`.

**Features**: hardware testing (CPU, RAM, storage, display…), Pramaan health scoring, grading (`grades.ts`), issue detection (`issues.ts`), fleet & lifecycle tracking, hardware fingerprinting.

**API**: served at the **frozen** legacy URLs — `/api/machines`, `/api/qc-results`, `/api/fleet`, `/api/machine-history`, `/api/pramaan`. These are **not** under `/api/laptops/*`; field-deployed desktop clients depend on them, so they must not be renamed.

### Android Module (`lib/platforms/android/`)
**Purpose**: mobile device quality control testing.

**Features**: phone + OTP authentication, device info, license activation/status, QC reports (full QC, stress, individual tests — battery/display/sensors), report history, user profile/account management.

**API**: `/api/mobile/*` (new namespace).

### Shared Infrastructure (`lib/shared/`)
**Purpose**: common functionality across platforms and audiences.

**Tables (representative)**: `users`, `customers`, `license_keys`, `free_trials`, plus commerce tables (plans, coupons, orders, renewals), releases, contacts, analytics events, and settings/provider config for payment/email/SMS.

**Features**:
- JWT auth + role-based access control
- License management (per-product or combined)
- Commerce: plans, coupons, orders, refunds, renewals
- Payments via a pluggable gateway abstraction (Razorpay implemented)
- Email (providers + templates) and SMS (pluggable providers, OTP delivery)
- App auto-update (releases + local-disk artifact storage), served via `/api/updates/[platform]/*`
- Analytics ingestion (`/api/track`) and admin overview
- OpenAPI document generation (`lib/openapi/`) backing the dashboard API reference

## Authentication & Authorization

### Admin users (`users` table)
- JWT auth (HTTP-only cookies)
- Roles: Admin, Technician, Client, Employee, OEM, Insurer
- Access dashboard + admin APIs

### B2C customers (`customers` table)
- Separate JWT auth system
- Buy licenses via the payment gateway; manage account in `/customer` and `store-website/`

### Mobile app users
- Phone number + OTP authentication (`/api/mobile/auth/*`)
- Session/token issued per device

### Desktop apps
- API-key authentication + license-key validation
- Submit QC results; no interactive user account

## License System

### License types
1. **Perpetual** — one-time purchase, unlimited duration
2. **Subscription** — recurring billing (handled via renewals)
3. **Trial** — time-limited (7/15/30 days), tracked in `free_trials`
4. **Demo** — special testing licenses

### Product types
- `laptop` — Windows QC license
- `mobile` — Android QC license
- `both` — combined license

## Payments

Gateways implement a common interface (`lib/shared/payment/gateway.interface.ts`) and are resolved through `gateway.factory.ts`. Razorpay is the current implementation (`razorpay.gateway.ts`). Customer-facing flows live under `/api/customer/payment/*` (callback, razorpay, webhook); admin gateway config under `/api/admin/payment-gateways/*`. Public/unauthenticated checkout for the storefront is under `/api/public/checkout`.

## API Surface (selected)

```
# Windows QC (frozen URLs)
POST/GET /api/qc-results              GET /api/qc-results/[id]
GET      /api/qc-results/count        GET /api/qc-results/issues-summary
GET      /api/qc-results/export[/sample]
GET      /api/machines  /api/machines/[id]
GET      /api/fleet  /api/fleet/[machineId]/lifecycle
GET      /api/machine-history[/alerts]
GET      /api/verify/[health_id]

# Mobile QC
POST /api/mobile/auth/{signup,login,request-otp,verify-otp,forgot-password,logout}
POST /api/mobile/license/{activate,status}      GET /api/mobile/device/info
POST /api/mobile/reports/{fullqc,stress,test,...}   GET /api/mobile/reports/history

# Shared / commerce
POST /api/auth/login   POST /api/auth/register
GET  /api/users  /api/users/me  /api/users/stats
GET  /api/licenses     GET /api/plans
POST /api/customer/auth/{login,register}   POST /api/customer/checkout
POST /api/public/checkout                  POST /api/track
GET  /api/updates/[platform]/latest        GET /api/updates/[platform]/download/[id]

# Admin
.../admin/{coupons,orders,plans,renewals,payment-gateways,settings,contacts,free-trials}
.../admin/email/{providers,templates,test}   .../admin/sms/{providers,test}
.../admin/releases   .../admin/analytics/overview
```

## Database Migrations

`drizzle/schema.ts` is the source of truth. Hand-written SQL goes in `drizzle/manual/`.

```bash
npx drizzle-kit generate   # generate migration after schema changes
npx drizzle-kit push       # apply
npx drizzle-kit studio     # browse
```

See `scripts/DB_COMMANDS.md` for backup/restore and sequence-fix helpers.

## Deployment

### Environment variables (representative)
```env
DATABASE_URL=postgresql://...
JWT_SECRET=...            API_KEY=...
# Payment / email / SMS provider credentials are stored in DB settings
# where possible, with secrets supplied via env.
NODE_ENV=production       NEXT_PUBLIC_API_URL=...
```

The storefront (`store-website/`) is a **separate** Next.js app with its own dependencies, build, and `.env.local`; it is deployed independently of the main `web/` app.

## Security Considerations

1. **Authentication** — admin JWT (HTTP-only cookies), customer JWT (separate), mobile phone+OTP, desktop API keys.
2. **Authorization** — role-based access control; license validation per request.
3. **Data protection** — bcrypt password hashing, response sanitization, Drizzle parameterized queries (SQL-injection safe).
4. **Provider secrets** — payment/email/SMS credentials managed via settings + env, not hard-coded.

## Adding a New Platform/Product

1. Create `lib/platforms/<name>/{domain/schemas,repositories,services}`.
2. Define schemas → repositories → services.
3. Add a new API namespace `app/api/<name>/*` (never reuse or rename frozen URLs).
4. Add dashboard pages under `app/dashboard/`.
5. Extend license `product_type` and validation in `lib/shared/`.
6. Add OpenAPI path specs under `lib/openapi/paths/`.

## Conventions

- Files: `kebab-case.ts` · Components: `PascalCase.tsx` · Functions: `camelCase()`
- Constants: `UPPER_SNAKE_CASE` · Database: `snake_case`
- TypeScript strict, async/await, Zod for validation, Drizzle for DB, Server Components by default.

## Resources

- `README.md` — setup · `scripts/DB_COMMANDS.md` — DB ops
- `drizzle/schema.ts` — schema source of truth
- `/dashboard/api-reference` — generated API reference (`lib/openapi/`)
- `/wiki`, `/dashboard/docs` — documentation

---

**Last Updated**: 2026-06
**Note**: This reflects the actual `lib/platforms/{windows,android}` + `lib/shared` layout and the frozen Windows API URLs. Earlier drafts describing `lib/laptop`/`lib/mobile` modules and `/api/laptops/*` routes are superseded.
