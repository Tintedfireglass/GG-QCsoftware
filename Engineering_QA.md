# Pramaan – Engineering Q&A
*Prepared from direct source analysis · March 2026*

---

## Section 1 — Diagnostics & Telemetry

### 1. Are all diagnostics executed automatically by the software?

**Partially.** The workflow is split into two explicit phases in `QCWorkflowService.RunAutomatedChecksAsync()`:

| Phase | Tests | Trigger |
|---|---|---|
| **Automated** | CPU (info + stress), RAM (info + stress), Storage, Battery, SMART, GPU stress, System Info | Runs automatically in sequence, no user input needed |
| **Interactive** | Keyboard, Trackpad, USB, Audio/Video, Audio Jack, Network | Manually recorded by the technician via `RecordXxxResult()` calls |

The workflow progresses through the `QCWorkflowStep` enum: `Preparation → AutomatedChecks → InteractiveTests → ReportGeneration → Complete`.

---

### 2. What hardware APIs are used to collect telemetry?

Three distinct layers are used, each as a fallback for the previous:

| API | What it reads | Where used |
|---|---|---|
| **LibreHardwareMonitor** (`LibreHardwareMonitor.Hardware`) | CPU temp, clock speed, GPU temp/load/clock, SSD health %, power-on hours, battery degradation | `SensorProvider.cs` — primary source |
| **WMI** (`System.Management`) | CPU base clock (`Win32_Processor`), CPU thermal zone (`MSAcpi_ThermalZoneTemperature`), battery, USB, display, audio, camera | `WmiProvider.cs` + `SensorProvider.cs` fallback |
| **Windows Performance Counters** (`System.Diagnostics.PerformanceCounter`) | CPU frequency estimation via "% Processor Performance" | `SensorProvider.cs` — fallback when LHM clock is unavailable |

**Specific WMI classes queried:** `Win32_Processor`, `Win32_PhysicalMemory`, `Win32_DiskDrive`, `Win32_Battery`, `Win32_USBController`, `Win32_PnPEntity`, `Win32_VideoController`, `Win32_SoundDevice`, `MSAcpi_ThermalZoneTemperature`.

In addition, `SmartctlProvider` shells out to the `smartctl` CLI tool (from smartmontools) to read NVMe/SATA SMART data and run short self-tests.

---

### 3. Can diagnostic results be normalized across different hardware models?

**Yes — this is already done.** The scoring system normalizes all raw metrics to a common 0–100 scale regardless of hardware model:

- **Battery:** `HealthPercent` → mapped to discrete score bands (90%+ → 100, 80%+ → 85, etc.) with a cycle count penalty
- **Storage/SSD:** Raw SMART health % extracted from detail strings via regex `\((\d+)%\)`; temperature bands normalize to 0–100
- **CPU/GPU thermal:** Verdict keywords (`EXCELLENT`, `WARNING`, `CRITICAL`) or raw peak temperature are mapped to score values
- **Binary tests** (Keyboard, Trackpad, USB): 100 = Pass, 0 = Fail — hardware-agnostic

The `GradingService` uses `TestDefinitions` (a registry of `ScoreFunc` delegates), and `PramaanScoringEngine` uses 6 weighted categories — both are hardware-model-agnostic.

---

### 4. How is the health score calculated?

Two parallel scoring systems run simultaneously (`GradingService.GradeReport()`):


#### System — PRAMAAN Health Score (PramaanScoringEngine)
6 categories → configurable weighted average → GradeBand (A+/A/B/C/Reject).

| Category | Default Weight |
|---|---|
| Storage (SMART + temp) | 25% |
| Thermal (CPU + GPU) | 20% |
| Battery | 20% |
| CPU + RAM | 15% |
| Physical Ports | 10% |
| Repair Modifier | 10% |

The Pramaan score also generates **per-category risk flags** when a category falls below its configured threshold (e.g., storage < 40, battery < 35).

---

### 5. Is the scoring model deterministic or adaptive?

**Deterministic** for a given configuration version. All score thresholds, weights, and grade bands are lookup tables and switch expressions — no randomness, no learned state. The same `QCReport` input will always produce the same output score.

However, the `PramaanScoringConfig` is fetched from the web API at runtime (`PramaanConfigService.GetActiveConfigAsync()`), meaning weights can be **centrally updated** between runs. Each result stores the `AlgorithmVersion` (`PramaanResult.AlgorithmVersion`) to maintain an audit trail of which config version produced a given score.

---

### 6. Can the scoring system be updated via software updates?

**Yes, and without a software update.** The `PramaanScoringEngine` loads its configuration from the backend API endpoint `pramaan/config` at runtime. The config object (`PramaanScoringConfig`) encapsulates:
- Category weights (`Dictionary<string, double>`)
- Grade band thresholds (`List<GradeBand>`)
- Per-category risk thresholds (`Dictionary<string, int>`)
- Default repair modifier score

If the API is unreachable, it falls back to hardcoded defaults (5-second timeout). Scoring logic changes that alter the algorithm itself (e.g., new score functions) still require a code update, but all threshold and weight tuning is API-driven.

---

## Section 2 — Configuration Baseline & Lifecycle

### 1. Can Pramaan detect hardware changes between diagnostic cycles?

**Partially — identity detection is present; delta detection is not yet implemented.**

The `DeviceIdService` generates a stable integer ID per device from:
1. BIOS serial number (`SystemInfo.SerialNumber`) — preferred
2. Computer name — fallback
3. MAC address — last resort

This ID is persisted in `%ProgramData%\Pramaan\device_registry.json` (a `Dictionary<string, int>` keyed on the normalized serial). If a device's serial changes (e.g., motherboard swap), a new ID is generated. However, there is currently **no diffing logic** that compares current hardware specs against a stored baseline to flag changes programmatically.

---

### 2. How are configuration baselines stored?

No explicit "baseline configuration snapshot" per device exists yet. What is persisted:
- **Device ID registry:** `%ProgramData%\Pramaan\device_registry.json` — maps serial → integer Device ID
- **Last QC timestamp:** `%AppData%\Pramaan\last_qc_test.txt` — used by the reminder system
- **QC Reports:** HTML files in `<app_dir>/Reports/QC_Report_<id>_<timestamp>.html`
- **Scoring config:** Fetched from backend; not cached locally between runs

Baseline snapshots of hardware state per device are **not yet stored** — this is a gap if change detection is required.

---

### 3. Can historical device states be reconstructed?

**Only through submitted reports.** Each `QCReport` submitted to the backend API (`QCSubmissionService.SubmitReportAsync()`) includes a full hardware snapshot:
- `SystemInfo` (manufacturer, model, serial, MAC, Device ID)
- `CpuDetails`, `RamDetails`, `StorageDetails`, `BatteryDetails`, `DeviceDetails`
- All test results with scores, grades, and detail strings

The backend receives these as `SubmitQCResultRequest` and (by design) stores them longitudinally. State reconstruction is therefore possible from the server-side history if the data has been submitted. Locally, each HTML report file contains the full snapshot for that run, but there is no local query/diff interface.

---

### 4. Is lifecycle data stored locally or centrally?

**Both — but asymmetrically:**

| Data | Storage | Persistence |
|---|---|---|
| Device ID registry | Local (`%ProgramData%\Pramaan\`) | Survives reboots, deleted on uninstall |
| Last QC timestamp | Local (`%AppData%\Pramaan\`) | Per-user |
| QC report HTML | Local (`<app_dir>/Reports/`) | Manual management |
| Full QC result + scores | Central (via `QCSubmissionService` → REST API) | Persistent, queryable |
| Scoring configuration | Central (pulled on each run) | Versioned |

---

### 5. How large can lifecycle records grow over time?

- **Local HTML reports:** ~15–50 KB per report. 1,000 devices × 1 report each ≈ ~20 MB — negligible.
- **Device registry JSON:** One entry per unique serial. 10,000 devices ≈ handful of KB.
- **Central database:** Each submission includes all 12 test results + 6 category scores + full hardware snapshot per `QCReport`. Estimated ~5–15 KB of JSON per submission. At 100 devices/day × 365 days = 36,500 records/year ≈ 200–500 MB/year uncompressed — very manageable with standard database compression.

---

## Section 3 — Certification Reports

### 1. Can diagnostic data be converted into a deterministic grade classification?

**Yes — this is the core function of the system.** The grade classification is fully deterministic:

- `GradingService.ScoreToGrade(int score)` → A/B/C/D/E/F via a `switch` expression
- `PramaanScoringConfig.ScoreToGrade(int score)` → A+/A/B/C/Reject via ordered `GradeBands`

The overall pass threshold is `OverallScore >= 50` (`QCReport.OverallPass`), making "sellable" vs. "reject" a deterministic binary output.

---

### 2. Can certification reports be generated automatically?

**Yes.** `ReportGenerator.GenerateHtmlReport(QCReport report)` and `ReportGenerator.SaveReport(QCReport report)` are called programmatically after `FinalizeGrades()`. No user interaction is required — the report is generated, saved to disk, and the path returned. The filename pattern is `QC_Report_<RefurbishId>_<yyyyMMdd_HHmmss>.html`. Additionally, a QR code linking to the verification URL `https://gg-qcsoftware.vercel.app/verify/<HealthId>` is embedded automatically if a `HealthId` is set.

---

### 3. Can certification reports be digitally signed?

**Tamper-evident hash is implemented — cryptographic digital signing is not.** `QCSubmissionService.MapToRequest()` computes a **SHA-256 hash** of the full serialized `QCReport` JSON and stores it as `report.DiagnosticHash` and `request.PramaanHash`. This allows the backend to verify that the submitted data has not been modified post-diagnostic.

True **digital signatures** (e.g., RSA/ECDSA with a certificate authority) are not currently implemented. If non-repudiation or regulatory compliance requires a verifiable signature, this is an architecture modification needed.

---

### 4. Can reports be exported in standard formats?

**HTML is the current format.** Reports are saved as fully self-contained HTML files (A4 print layout, embedded CSS, base64-encoded QR code). This means:
- **HTML** — supported natively
- **PDF** — supported indirectly via browser print-to-PDF (the report has `@page { size: A4; }` CSS)

---

## Section 4 — Predictive Modeling & Telemetry

### 1. Can telemetry data be stored longitudinally?

**Yes — centrally.** Every submission via `QCSubmissionService` includes a timestamped `QCReport` with hardware snapshots and all scored metrics. The backend API is designed to receive and store these records, enabling longitudinal analysis across multiple QC runs of the same device.

Locally, each HTML report file is timestamped but not queryable programmatically.

---

### 2. Can degradation trends be computed over time?

**Not yet in the client** — the data foundation exists centrally. The per-device `DeviceId` links all historical submissions, and metrics like `BatteryDetails.HealthPercent`, `BatteryDetails.CycleCount`, `StorageDetails.Devices[].HealthPercent`, and `StorageDetails.Devices[].PowerOnHours` are captured at each run. A backend analytics layer could compute deltas between submissions to produce degradation trends.

The `PramaanScoringEngine` currently produces a point-in-time score — trend analysis (e.g., "battery degrades X% per year") would require querying historical records and is a **future-phase capability**.

---

### 3. Is sufficient telemetry captured for predictive modeling?

**Partially — key signals are present but some are missing.** Current captures:

| Signal | Captured | Notes |
|---|---|---|
| Battery health % | ✅ | Per run |
| Battery cycle count | ✅ | Per run |
| Battery wear level % | ✅ | Where reported by hardware |
| SSD health % / remaining life | ✅ | Via LHM + SmartCtl |
| SSD temperature | ✅ | Per run |
| SSD power-on hours | ✅ | Via LHM |
| SSD total bytes written (TBW) | ✅ | Via LHM |
| CPU thermal throttle severity | ✅ | Stress test verdict |
| CPU/GPU peak temperature | ✅ | During stress test |
| GPU clock drop % | ✅ | Stress test |
| RAM capacity & module config | ✅ | Static — no degradation metric |
| RAM error rates | ❌ | Not captured — would need memtest-style ECC data |
| Fan speed / acoustic data | ❌ | Not captured |
| Capacitor/PSU health | ❌ | Not in scope |

For battery and storage predictive models, the captured data is sufficient. For CPU/system-level longevity modeling, additional features (fan RPM, inter-run thermal delta) would strengthen the model.

---

### 4. What statistical methods could be used?

Based on the available telemetry:

| Use Case | Suggested Method |
|---|---|
| Battery RUL (Remaining Useful Life) | Linear regression on health% vs. cycle count; exponential decay model |
| SSD failure prediction | Survival analysis (Kaplan-Meier); logistic regression on TBW + power-on hours |
| Grade drift over time | Time-series smoothing (EWMA) on PRAMAAN score per device |
| Anomaly detection (outlier devices) | Isolation Forest or Z-score on category scores |
| Grade classification | Already deterministic (rule-based); optional ML validation with Random Forest |

The `AlgorithmVersion` field on each result ensures that score comparisons across time account for config changes.

---

## Section 5 — Hardware Fingerprinting

### 1. Which hardware identifiers can be reliably extracted?

From `QCWorkflowService.RunAutomatedChecksAsync()` and `SystemDiagnostic`:

| Identifier | Source | Reliability |
|---|---|---|
| BIOS Serial Number | WMI `Win32_BIOS` / `Win32_SystemEnclosure` | **High** — burned in at factory |
| MAC Address | WMI `Win32_NetworkAdapterConfiguration` | **Medium** — can be spoofed; changes with NIC swap |
| Computer Name | `Environment.MachineName` | **Low** — user-changeable |
| CPU model + core/thread count | WMI `Win32_Processor` | **High** — stable for the life of the CPU |
| RAM module count, speed, capacity | WMI `Win32_PhysicalMemory` | **High** — changes only on upgrade |
| Storage model names | WMI `Win32_DiskDrive` | **High** — stable until drive replacement |

The identity resolution priority in code is: `SerialNumber → ComputerName → MacAddress`.

---

### 2. How stable are these identifiers across reboots?

| Identifier | Reboot Stability | Reinstall Stability |
|---|---|---|
| BIOS Serial | ✅ Fully stable | ✅ Stable (hardware-level) |
| MAC Address | ✅ Stable (HW) | ✅ Stable unless NIC swap |
| Computer Name | ✅ Stable | ⚠️ Changes on OS reinstall |
| Device ID (Pramaan) | ✅ Stable (registry file) | ❌ Lost on uninstall without backup |

The `device_registry.json` file is stored in `%ProgramData%\Pramaan\` (machine-scoped, not user-scoped), so it survives user profile resets but not application uninstalls.

---

### 3. Can telemetry signatures be incorporated?

**Yes — as a composite fingerprint.** The current identity uses a single identifier. A telemetry-based signature could combine:
- CPU model + core count (static hardware)
- Total RAM capacity (semi-static)
- Primary storage model (semi-static)
- A stability-weighted hash of the above

This multi-factor "hardware fingerprint" would be more resilient to single-identifier changes (e.g., MAC address spoofing or NIC replacement) and could be stored alongside the Device ID. **This is architecturally feasible with a minor addition to `DeviceIdService`.**

---

### 4. What hash algorithm is used?

**SHA-256** — used in `QCSubmissionService.MapToRequest()`:
```csharp
using (SHA256 sha256 = SHA256.Create())
{
    byte[] hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(jsonReport));
    request.PramaanHash = BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
}
```
This hash covers the **entire serialized `QCReport` JSON**, making it a tamper-evident snapshot of the full diagnostic result, not just the identity. A separate identity-specific fingerprint hash does not currently exist.

---

### 5. How are identity collisions prevented?

Currently, identity is keyed on the **exact, normalized serial number string** (`TRIM().ToUpperInvariant()`), stored as a `Dictionary<string, int>` in `device_registry.json`. Collision prevention strategy:

- **BIOS serial uniqueness** is assumed (manufacturer responsibility)
- **Auto-increment** with floor at `StartId = 3,000,001` ensures no two serials get the same integer ID
- **Thread safety** is enforced with a `lock(_lock)` around all registry read/write operations

**Limitations:** Two devices with identical or blank serial numbers will collide to a single Device ID (or both get ID = 0 if serial is blank). A multi-factor identifier hash would address this edge case.

---

## Engineering Validation Checklist

| Feature / Capability | Status | Notes |
|---|---|---|
| **All diagnostics execute automatically** | ✅ **Feasible** | Automated phase runs without user input; interactive phase is manual by design |
| **Hardware APIs for telemetry** | ✅ **Feasible** | LibreHardwareMonitor + WMI + Performance Counters + smartctl |
| **Normalize results across hardware models** | ✅ **Feasible** | All scores normalized to 0–100 via scoring functions |
| **Health score calculation** | ✅ **Feasible** | Dual-system: GradingService + PramaanScoringEngine, both implemented |
| **Deterministic scoring model** | ✅ **Feasible** | Fully deterministic for a given config version |
| **Scoring updated via software** | ✅ **Feasible** | Config pulled from API at runtime; no software update required for weights/thresholds |
| **Detect hardware changes between cycles** | ⚠️ **Partially Feasible** | Device ID tracking exists; delta comparison requires architecture addition |
| **Configuration baselines stored** | ⚠️ **Partially Feasible** | Device ID + last-run timestamp stored; full hardware baseline snapshots not yet persisted locally |
| **Reconstruct historical device states** | ⚠️ **Partially Feasible** | Possible from central backend submissions; no local query interface |
| **Lifecycle data stored** | ✅ **Feasible** | Both locally (HTML) and centrally (API) |
| **Lifecycle record size management** | ✅ **Feasible** | ~5–15 KB/report; well within standard DB/storage limits |
| **Deterministic grade classification** | ✅ **Feasible** | Implemented — fully deterministic rule-based engine |
| **Certification reports auto-generated** | ✅ **Feasible** | `ReportGenerator` produces HTML + QR code automatically |
| **Digital signing of reports** | ⚠️ **Partially Feasible** | SHA-256 tamper-evident hash implemented; true crypto signing requires architecture modification |
| **Export in standard formats (PDF/JSON)** | ⚠️ **Partially Feasible** | HTML + browser PDF today; programmatic PDF/JSON export requires additional library |
| **Longitudinal telemetry storage** | ✅ **Feasible** | Central API designed for this; local HTML files are timestamped |
| **Degradation trend computation** | ⚠️ **Partially Feasible** | Data captured; trend computation logic not yet in client — backend/analytics phase |
| **Sufficient telemetry for predictive modeling** | ⚠️ **Partially Feasible** | Battery + storage signals strong; RAM error rates and fan RPM not captured |
| **Statistical methods for prediction** | ⚠️ **Partially Feasible** | Data foundation ready; ML/stats layer not yet built — architecture modification needed |
| **Reliable hardware identifiers** | ✅ **Feasible** | BIOS serial, MAC, CPU/RAM/storage model all extracted reliably |
| **Identifier stability across reboots** | ✅ **Feasible** | BIOS serial and MAC are hardware-stable |
| **Telemetry composite fingerprint** | ⚠️ **Partially Feasible** | Currently single-identifier; multi-factor hash is architecturally feasible |
| **SHA-256 hash algorithm in use** | ✅ **Feasible** | Implemented in `QCSubmissionService` |
| **Identity collision prevention** | ⚠️ **Partially Feasible** | Works for unique serials; blank/duplicate serials are an edge case to address |
