# Architecture Overview

> **Audience:** All engineers  
> **Classification:** Internal

---

## System Architecture

Pramaan is a **monorepo** containing three independent but integrated components:

```
gg-qcsoftware/
├── src/              # Windows Desktop Application (C# / .NET 8 / WPF)
│   ├── LaptopQC.App/         WPF UI layer (Windows only)
│   ├── LaptopQC.Core/        Shared business logic (cross-platform)
│   ├── LaptopQC.Hardware/    Windows hardware providers (WMI, LHM, smartctl)
│   └── LaptopQC.Reminder/    Windows reminder/toast notification service
│
├── cli/              # Linux CLI Tool (C# / .NET 8 / Linux x64)
│   ├── Program.cs            Entry point, interactive TUI, menu handling
│   ├── Diagnostics/          Linux hardware diagnostic modules
│   ├── UI/                   TUI dashboard renderer (Spectre.Console)
│   └── Agent/                Headless server health agent mode
│
└── web/              # Admin Dashboard (Next.js 16 / TypeScript / PostgreSQL)
    ├── app/                  Next.js App Router pages + API routes
    ├── lib/                  Database, auth, types, utilities
    ├── components/           React UI components
    └── migrations/           PostgreSQL database migration scripts
```

---

## Component Relationships

All three clients (Linux CLI, Windows Desktop, Agent) communicate with the web dashboard's REST API using JWT authentication. The web dashboard reads/writes PostgreSQL.

**API Base URL:** `https://pramaan-dashboard.gadgetguruz.com/api`

---

## Data Flow — QC Result Submission

```
1. Hardware Diagnostics (local)
   └─ LinuxCpuDiagnostic / LinuxRamDiagnostic / etc.
   └─ LinuxSmartTestService (smartctl binary)

2. Stress Tests (local)
   └─ LinuxCpuStressTest / LinuxRamStressTest / LinuxGpuStressTest

3. Interactive Tests (technician input)

4. Grading (local computation)
   └─ PramaanScoringEngine
   └─ PramaanScoringConfig fetched from API at runtime

5. SHA-256 hash computed over full QCReport JSON

6. POST /api/qc-results  (QCSubmissionService)
   └─ JWT Bearer auth header included
   └─ Full hardware snapshot + scores in payload

7. Dashboard stores result
   └─ machines, qc_results, test_results, machine_history updated
```

---

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Web framework | Next.js | 16.x |
| Language (web) | TypeScript | 5.x |
| UI library | React | 19.x |
| Styling | Tailwind CSS | 4.x |
| Database | PostgreSQL | 14+ |
| DB client | pg (node-postgres) | 8.x |
| Auth | jsonwebtoken (HS256) | 9.x |
| Password hashing | bcryptjs | 3.x |
| Charts | Recharts | 3.x |
| Desktop language | C# | 12 |
| Desktop runtime | .NET 8 | 8.x |
| Desktop UI (Windows) | WPF | — |
| TUI library (CLI) | Spectre.Console | — |
| Hardware (Windows) | LibreHardwareMonitor, WMI | — |
| Hardware (Linux) | lsblk, smartctl, /proc, sysfs | — |

---

## Authentication Architecture

### Dashboard (Web)
- **Token type:** HS256 JWT stored in `localStorage` (`qc_token`)
- **Expiry:** 7 days; 401 response redirects to `/login`

### CLI / Desktop App
- **Token stored:** `~/.pramaan/session.json` (Linux)
- **Refresh:** Background heartbeat re-authenticates every 4 hours

### Machine Identity → Device ID Resolution
```
Priority order:
  1. BIOS Serial Number (preferred)
  2. Computer Name (fallback)
  3. MAC Address (last resort)

Device IDs stored in device_registry.json (floor = 3,000,001)
```

---

## Security

| Concern | Mechanism |
|---|---|
| API authentication | JWT Bearer tokens on all protected routes |
| Password storage | bcryptjs (cost factor 10) |
| Report integrity | SHA-256 hash of full QCReport JSON |
| License validation | Server-side + machine identity binding |
| Database | Parameterized queries throughout |
| HTTPS | Enforced by Vercel / hosting provider |

---

## Web Directory Map

```
web/app/api/
├── auth/           Login, register, token validation
├── qc-results/     Submit, list, retrieve + count + issues-summary
├── machines/       Register, list, update machines
├── machine-history/History submission + degradation alerts
├── users/          CRUD user management + stats
├── licenses/       License key management
├── pramaan/        Scoring config endpoint
├── fleet/          Enterprise fleet management
├── server-health/  Agent health report submission
├── verify/         Public certificate verification
├── admin/          Admin-only endpoints (free trials)
└── customer/       B2C customer portal endpoints
```

---

*← Back to [Documentation Index](../README.md)*
