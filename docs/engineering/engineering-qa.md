# Engineering Q&A

> **Audience:** All engineers, technical leads  
> **Classification:** Internal  
> *Prepared from direct source analysis — May 2026*

---

This document answers key technical questions about the Pramaan platform's architecture, covering diagnostics, scoring, telemetry, hardware fingerprinting, and certification. It is intended as a deep-dive reference for engineers and technical stakeholders.

---

## Section 1 — Diagnostics & Telemetry

### Are all diagnostics executed automatically?

**Partially.** The QC workflow splits into two explicit phases:

| Phase | Tests | Trigger |
|---|---|---|
| **Automated** | CPU, RAM, Storage, Battery, SMART, GPU stress, System Info | Runs automatically in sequence |
| **Interactive** | Keyboard, Trackpad, USB, Audio/Video, Audio Jack, Network | Manually recorded by the technician |

The workflow progresses through `QCWorkflowStep`: `Preparation → AutomatedChecks → InteractiveTests → ReportGeneration → Complete`.

---

### What hardware APIs are used to collect telemetry?

Three distinct layers are used on Windows, each as a fallback:

| API | What It Reads |
|---|---|
| **LibreHardwareMonitor** | CPU temp, clock speed, GPU temp/load, SSD health %, power-on hours, battery |
| **WMI** (`System.Management`) | CPU, RAM, disk, battery, USB, display, audio, camera via Win32_* classes |
| **Windows Performance Counters** | CPU frequency estimation (fallback when LHM clock unavailable) |

On Linux, the CLI uses native filesystem reads (`/proc`, `/sys`, `lsblk`, `smartctl`) — no WMI.

---

### Can diagnostic results be normalized across different hardware models?

**Yes — this is already done.** All raw metrics are normalized to a 0–100 scale:

- **Battery:** health% → discrete score bands (90%+ → 100, 80%+ → 85, etc.) with cycle count penalty
- **Storage:** raw SMART health % → score bands; temperature bands add penalty
- **CPU/GPU thermal:** verdict keywords (`EXCELLENT`, `WARNING`, `CRITICAL`) → score values
- **Binary tests** (Keyboard, Trackpad, USB): 100 = Pass, 0 = Fail — hardware-agnostic

---

### How is the health score calculated?

**PramaanScoringEngine:** 6-category weighted composite → configurable grade bands (A+/A/B/C/Reject).

| Category | Default Weight |
|---|---|
| Storage (SMART + temp) | 25% |
| Thermal (CPU + GPU) | 20% |
| Battery | 20% |
| CPU + RAM | 15% |
| Physical Ports | 10% |
| Repair Modifier | 10% |

Default grade bands (from `PramaanScoringConfig.cs`): **A+** ≥ 90 · **A** ≥ 80 · **B** ≥ 70 · **C** ≥ 60 · **D** ≥ 50 · **Reject** < 50

---

### Is the scoring model deterministic or adaptive?

**Deterministic** for a given configuration version. All score thresholds, weights, and grade bands are lookup tables — no randomness, no learned state. The same `QCReport` always produces the same score.

However, `PramaanScoringConfig` is fetched from the web API at runtime, meaning weights can be **centrally updated** between runs. Each result stores `AlgorithmVersion` for auditing.

---

### Can the scoring system be updated without a software update?

**Yes.** `PramaanScoringEngine` loads its configuration from `GET /api/pramaan/config` at runtime. The config object encapsulates:
- Category weights (`Dictionary<string, double>`)
- Grade band thresholds (`List<GradeBand>`)
- Per-category risk thresholds (`Dictionary<string, int>`)
- Default repair modifier score

If the API is unreachable, it falls back to hardcoded defaults (5-second timeout). Only algorithm logic changes require a code update — all threshold/weight tuning is API-driven.

---

## Section 2 — Configuration Baseline & Lifecycle

### Can Pramaan detect hardware changes between diagnostic cycles?

**Partially.** The `DeviceIdService` generates a stable integer ID per device from serial → hostname → MAC (in priority order). Identity is persistent across reboots. However, there is currently **no diffing logic** that compares current hardware specs against a stored baseline to programmatically flag component changes.

---

### How are configuration baselines stored?

No explicit per-device baseline snapshot exists. What is persisted:

| Data | Storage |
|---|---|
| Device ID registry | Local — `device_registry.json` |
| Last QC timestamp | Local — `last_qc_test.txt` |
| QC report (HTML) | Local — `Reports/QC_Report_*.html` |
| Scoring config | Central — fetched from API (not cached locally) |

Full hardware baseline snapshots per device are **not yet persisted locally** — this is a gap if local change detection is required.

---

### Can historical device states be reconstructed?

**Only through submitted reports.** Each `QCReport` submitted includes a full hardware snapshot. The backend stores these longitudinally. State reconstruction is possible from server-side history. Locally, HTML reports contain snapshots per run, but there is no local query interface.

---

### How large can lifecycle records grow over time?

- **Local HTML reports:** ~15–50 KB per report — negligible at scale
- **Central database:** ~5–15 KB of JSON per submission. At 100 devices/day × 365 days = ~200–500 MB/year uncompressed — very manageable with standard PostgreSQL compression and indexing

---

## Section 3 — Certification Reports

### Can diagnostic data be converted into a deterministic grade classification?

**Yes — this is the core function of the system.**
- `PramaanScoringConfig.ScoreToGrade(int score)` → A+/A/B/C/D/Reject via ordered grade bands
- Default Pramaan grade bands: A+ ≥ 90, A ≥ 80, B ≥ 70, C ≥ 60, D ≥ 50, Reject < 50
- Overall pass threshold: `PramaanScore ≥ 50` (grade C minimum)

---

### Can certification reports be generated automatically?

**Yes.** `ReportGenerator.GenerateHtmlReport(QCReport report)` and `SaveReport()` are called automatically after grading completes. No user interaction required. The filename pattern is `QC_Report_<RefurbishId>_<yyyyMMdd_HHmmss>.html`. A QR code linking to the verification URL is embedded automatically when a `HealthId` is set.

---

### Can certification reports be digitally signed?

**Tamper-evident hash is implemented — cryptographic signing is not.**

`QCSubmissionService` computes a **SHA-256 hash** of the full serialized `QCReport` JSON:

```csharp
using (SHA256 sha256 = SHA256.Create()) {
    byte[] hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(jsonReport));
    request.PramaanHash = BitConverter.ToString(hashBytes)
                              .Replace("-", "").ToLowerInvariant();
}
```

This allows the backend to verify that submitted data has not been modified post-diagnostic. True **digital signatures** (RSA/ECDSA with a CA) are not currently implemented.

---

### Can reports be exported in standard formats?

**HTML is the current format.** Reports are fully self-contained HTML files with embedded CSS and base64-encoded QR codes. PDF is supported via browser print-to-PDF (`@page { size: A4; }`). Programmatic PDF export via `pdf-lib` is available in the web dashboard.

---

## Section 4 — Predictive Modeling & Telemetry

### Is sufficient telemetry captured for predictive modeling?

**Partially — key signals are present but some are missing:**

| Signal | Captured | Notes |
|---|---|---|
| Battery health % | ✅ | Per run |
| Battery cycle count | ✅ | Per run |
| SSD health % / remaining life | ✅ | Via LHM + smartctl |
| SSD power-on hours | ✅ | Via LHM |
| SSD total bytes written | ✅ | Via LHM |
| CPU thermal throttle severity | ✅ | Stress test verdict |
| CPU/GPU peak temperature | ✅ | During stress test |
| RAM error rates | ❌ | Would need memtest-style ECC data |
| Fan speed / acoustic data | ❌ | Not captured |

---

### What statistical methods could be used for predictive modeling?

| Use Case | Suggested Method |
|---|---|
| Battery remaining useful life | Linear regression on health% vs. cycle count |
| SSD failure prediction | Survival analysis (Kaplan-Meier) on TBW + power-on hours |
| Grade drift over time | Time-series EWMA on Pramaan score per device |
| Anomaly detection | Isolation Forest or Z-score on category scores |
| Grade classification | Already deterministic; optional ML validation with Random Forest |

---

## Section 5 — Hardware Fingerprinting

### Which hardware identifiers can be reliably extracted?

| Identifier | Reliability |
|---|---|
| BIOS Serial Number | **High** — burned in at factory |
| MAC Address | **Medium** — can be spoofed; changes with NIC swap |
| Computer Name | **Low** — user-changeable |
| CPU model + core/thread count | **High** — stable for the life of the CPU |
| RAM module count, speed, capacity | **High** — changes only on upgrade |
| Storage model names | **High** — stable until drive replacement |

Identity resolution priority in code: `SerialNumber → ComputerName → MacAddress`.

---

### How stable are identifiers across reboots?

| Identifier | Reboot Stable | Reinstall Stable |
|---|---|---|
| BIOS Serial | ✅ Fully stable | ✅ Hardware-level |
| MAC Address | ✅ Stable | ✅ Unless NIC swap |
| Computer Name | ✅ Stable | ⚠️ Changes on OS reinstall |
| Pramaan Device ID | ✅ Stable (registry file) | ❌ Lost on uninstall |

The `device_registry.json` is machine-scoped (survives user profile resets, lost on full uninstall).

---

### How are identity collisions prevented?

Identity is keyed on the **exact, normalized serial number string** (`TRIM().ToUpperInvariant()`). Auto-increment with a floor of `3,000,001` ensures no two serials get the same integer ID. Thread safety is enforced with `lock(_lock)` around all registry read/write operations.

**Limitation:** Devices with identical or blank serial numbers will collide to a single Device ID. A multi-factor identifier hash (CPU model + RAM + storage) would address this edge case.

---

## Engineering Validation Summary

| Capability | Status |
|---|---|
| All diagnostics execute automatically | ✅ Implemented — automated + interactive phases |
| Hardware APIs for telemetry | ✅ LHM + WMI + Performance Counters + smartctl |
| Normalize results across hardware | ✅ All scores normalized 0–100 |
| Health score calculation | ✅ PramaanScoringEngine — 6-category weighted composite |
| Deterministic scoring model | ✅ Fully deterministic for a given config version |
| Scoring updated without software update | ✅ Config pulled from API at runtime |
| Detect hardware changes between cycles | ⚠️ Device ID exists; delta comparison not yet built |
| Configuration baselines stored | ⚠️ Device ID + last-run timestamp; full snapshots not local |
| Reconstruct historical device states | ⚠️ Possible from central backend; no local query interface |
| Lifecycle data stored | ✅ Local HTML + central API |
| Deterministic grade classification | ✅ Fully deterministic rule-based engine |
| Certification reports auto-generated | ✅ HTML + QR code, automatic post-grading |
| Digital signing of reports | ⚠️ SHA-256 tamper-evident hash; true crypto signing not implemented |
| Export in standard formats | ⚠️ HTML + browser PDF; programmatic PDF via pdf-lib in web |
| Longitudinal telemetry storage | ✅ Central API designed for this |
| Degradation trend computation | ⚠️ Data captured; trend computation in backend analytics phase |
| Telemetry for predictive modeling | ⚠️ Battery + storage signals strong; RAM errors + fan RPM missing |
| Hardware identifiers extractable | ✅ BIOS serial, MAC, CPU/RAM/storage model |
| Identifier stability across reboots | ✅ BIOS serial and MAC are hardware-stable |
| SHA-256 hash algorithm | ✅ Implemented in QCSubmissionService |
| Identity collision prevention | ⚠️ Works for unique serials; blank/duplicate serials are an edge case |

---

*← Back to [Documentation Index](../README.md)*
