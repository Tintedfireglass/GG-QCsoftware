# Pramaan — Product Overview

> **Audience:** Business stakeholders, management, sales, onboarding  
> **Classification:** Internal

---

## What is Pramaan?

**Pramaan** (Sanskrit: *proof*, *certification*) is Gadget Guruz's proprietary quality-control platform for refurbished laptops and enterprise IT assets. It combines automated hardware diagnostics, a deterministic grading engine, and a centralized cloud dashboard to produce consistent, auditable device health certificates.

The platform ensures every device leaving a refurbishment workflow has been rigorously tested, scored on a verified scale, and certified with a tamper-evident digital record — accessible to buyers, insurers, fleet managers, and resellers alike.

---

## The Problem It Solves

| Pain Point | Without Pramaan | With Pramaan |
|---|---|---|
| **Inconsistent QC** | Each technician tests differently; results vary | Standardized automated tests with a reproducible score |
| **No audit trail** | Paper checklists, lost records | Every result stored centrally with full hardware snapshot |
| **Buyer trust gap** | "This laptop is refurbished" — no proof | QR-code-verified certificate anyone can check at `/verify/<id>` |
| **Fleet blind spots** | IT managers don't know when machines degrade | Dashboard shows score trends, degradation alerts, fleet health |
| **Fake certifications** | Reports can be forged | SHA-256 tamper-evident hash tied to each submission |

---

## How It Works — High Level

```
┌────────────────────┐     ①  Diagnostics        ┌─────────────────────┐
│   QC Technician    │ ─────────────────────────► │  Pramaan CLI /      │
│   (or automated    │                            │  Windows Desktop App│
│    agent)          │ ◄─────────────────────────  │                     │
└────────────────────┘     ②  Grade + Report       └────────┬────────────┘
                                                             │
                                                  ③ Submit via REST API
                                                             │
                                                             ▼
                                                   ┌─────────────────────┐
                                                   │  Pramaan Dashboard  │
                                                   │  (Web — Next.js)    │
                                                   └────────┬────────────┘
                                                            │
                              ┌─────────────────────────────┼──────────────────────┐
                              ▼                             ▼                      ▼
                     ┌──────────────┐           ┌──────────────────┐     ┌─────────────────┐
                     │  QC Manager  │           │  Enterprise IT   │     │  Buyer / Insurer │
                     │  (results,   │           │  (fleet health,  │     │  (public verify  │
                     │   reports)   │           │   alerts)        │     │   page)          │
                     └──────────────┘           └──────────────────┘     └─────────────────┘
```

**Step ①** — A technician runs the Pramaan CLI or Windows app on the device under test.  
**Step ②** — The app runs automated hardware tests (CPU, RAM, storage, battery, GPU, network) and optionally interactive tests (keyboard, trackpad, USB, audio). Results are graded using the Pramaan scoring engine.  
**Step ③** — The completed report is submitted to the cloud dashboard via REST API.  
**Post-submission** — Managers, fleet owners, buyers, and insurers can access results via the dashboard or a public verification URL.

---

## Key Capabilities

### 1. Automated Hardware Diagnostics
- CPU detection + stress test (thermal throttle detection)
- RAM capacity & speed detection + memory stress test
- Storage SMART health check + SMART short self-test
- Battery health percentage, cycle count, wear level
- GPU detection + stress test with temperature monitoring
- Network connectivity check (WiFi + Ethernet)
- RAID array status (software RAID via `/proc/mdstat`, hardware RAID via SMART passthrough)

### 2. Deterministic Grading
Every device receives a **Pramaan Score (0–100)** and a **Grade Band**:

| Grade | Label | Score Range |
|---|---|---|
| **A+** | Certified Premium | 85–100 |
| **A** | Certified | 70–84 |
| **B** | Good Condition | 55–69 |
| **C** | Acceptable | 40–54 |
| **Reject** | Not Certified | 0–39 |

Scoring is fully deterministic — the same hardware in the same state always produces the same score.

### 3. Certification Reports
- Auto-generated HTML report with QR code for buyer verification
- Publicly accessible at `https://pramaan-dashboard.gadgetguruz.com/verify/<healthId>`
- SHA-256 tamper-evident hash prevents post-diagnostic tampering

### 4. Cloud Dashboard
- Centralized view of all submitted QC results
- Searchable by serial number, model, date, grade
- Machine history tracking — see how a device's health changes over time
- Degradation alerts — notifies managers when a machine's grade drops
- User management with role-based access control

### 5. Fleet Management (Enterprise)
- Enroll company machines and group them into pools
- Track lifecycle events: enrolled → tested → repaired → retired
- Per-machine health timeline
- Issues dashboard — immediately see which machines need attention

### 6. Server Health Monitoring (Agent Mode)
- The same CLI binary can run in **agent mode** to monitor Linux servers
- Checks: CPU load, memory usage, disk usage, network connectivity, systemd services, NTP sync
- Reports pushed to the cloud dashboard via the same API

---

## Deployment

| Component | Hosting |
|---|---|
| **Web Dashboard** | Vercel (or any Node.js host — DigitalOcean, Railway, etc.) |
| **Database** | PostgreSQL (Vercel Postgres, Supabase, Neon, DigitalOcean) |
| **CLI** | Distributed as a standalone Linux x64 binary — no .NET installation required |
| **Windows App** | Distributed via Windows Installer (Inno Setup `.exe`) |

---

## Supported Platforms

| Platform | Supported | Notes |
|---|---|---|
| Linux x64 | ✅ Full support | CLI + Agent mode |
| Windows 10/11 x64 | ✅ Full support | Desktop app + CLI |
| macOS | ⚠️ Planned | See macOS Porting Report |
| Browser (dashboard) | ✅ Full support | Any modern browser |

---

*← Back to [Documentation Index](../README.md)*
