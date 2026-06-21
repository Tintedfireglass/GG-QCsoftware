# Scoring Engine

> **Audience:** Backend engineers, data analysts  
> **Classification:** Internal

---

## Overview

Pramaan computes a **Pramaan Score** (0–100) and grade on every completed QC report using `PramaanScoringEngine` — the sole scoring system. Individual test results also receive per-component scores (0–100) used for display; the overall device grade is always the Pramaan Score.

---

## PramaanScoringEngine

**File:** `src/LaptopQC.Core/Services/PramaanScoringEngine.cs`

The Pramaan engine computes a **weighted composite score** across 6 categories. Configuration (weights, thresholds, grade bands) is loaded from the cloud API at runtime.

### Input: PramaanScoringConfig

```csharp
public class PramaanScoringConfig {
    public string Version { get; set; }                    // e.g. "1.0.3"
    public Dictionary<string, double> Weights { get; set; } // JSON: "weights"
    public List<GradeBand> GradeBands { get; set; }
    public Dictionary<string, int> RiskThresholds { get; set; }
    public int DefaultRepairModifierScore { get; set; }
    public int CertificationValidityDays { get; set; }
}
```

Config is fetched from `GET /api/pramaan/config`. On network failure, hardcoded defaults apply (5-second timeout).

### Category Computation

| Category Key | Source Data | Default Weight |
|---|---|---|
| `storage` | StorageDetails.Devices[].HealthPercent, SMART temp, self-test | 25% |
| `thermal` | CPU stress test verdict, GPU max temp | 20% |
| `battery` | BatteryDetails.HealthPercent, CycleCount | 25% |
| `cpu_ram` | CpuTest.Passed, RamTest.Passed, stress results | 15% |
| `physical_ports` | UsbTest, AudioJackTest, TrackpadTest, KeyboardTest | 5% |
| `repair_modifier` | Technician-entered repair info | 10% |

### Storage Category Detail (PramaanScoringEngine)

The `PramaanScoringEngine.ScoreStorage()` computes an **average** across per-drive health scores and a separate temperature score:

1. For each drive with SMART health %, add the health % directly as a score (0–100)
2. For each drive with a temperature reading, add a temperature score:

| Temperature | Score added |
|---|---|
| ≤ 40°C | 100 |
| ≤ 50°C | 85 |
| ≤ 55°C | 70 |
| ≤ 60°C | 50 |
| > 60°C | 25 |

3. Storage binary test pass → adds 100; fail → adds 0
4. Final = average of all collected scores (neutral 50 if nothing collected)
5. Suspicious flag → -20
6. SMART self-test failure → cap at 30
7. All-eMMC-no-health → cap at 80

### Thermal Category Detail (PramaanScoringEngine)

CPU thermal score from verdict keyword in `CpuTest.Message`:

| Keyword (evaluated in this order) | CPU Thermal Score |
|---|---|
| EXCELLENT | 100 |
| CRITICAL | 5 |
| FAIL | 20 |
| WARNING | 50 |
| PASS | 100 |
| (none / other) | 100 if passed, else 20 |

> **Note:** The evaluation uses `else if` chains, so order matters. CRITICAL is checked before FAIL — a message containing both (e.g. "CRITICAL: system FAIL") will score 5, not 20.

GPU thermal score from max temperature in `GpuTest.Details`:

| GPU Max Temp | GPU Score |
|---|---|
| ≤ 80°C | 100 |
| ≤ 85°C | 80 |
| ≤ 90°C | 65 |
| ≤ 95°C | 45 |
| > 95°C | 10 |
| GPU failed (Passed = false) | 10 |
| No discrete GPU | excluded (not scored) |

Final thermal = average of CPU and GPU thermal scores (or CPU only if no discrete GPU). Returns **70** (neutral default) if neither CPU nor GPU test was run.

### Battery Category Detail (PramaanScoringEngine)

If battery BMS data is tampered/unreadable → returns **0** immediately.


Base score from health % (non-linear curve):

| Health | Score |
|---|---|
| ≥ 90% | 100 |
| ≥ 80% | 88 |
| ≥ 70% | 72 |
| ≥ 60% | 55 |
| ≥ 50% | 38 |
| ≥ 40% | 22 |
| < 40% | 10 |

Cycle count penalty:
- ≤ 500: no penalty
- > 500: -3
- > 1000: -8
- > 1500: -15
- Missing cycle data: -3

Wear level penalty (if `WearLevelPercent` is available):
- wear > 40%: -10
- wear > 25%: -5

No battery (desktop) → returns 100 (no penalty).

### Composite Score Calculation

```
PramaanScore = Σ (categoryScore[i] × weight[i])
= storage×0.25 + thermal×0.20 + battery×0.25
              + cpu_ram×0.15 + physical_ports×0.05 + repair_modifier×0.10
```

Score is clamped to [0, 100] and rounded to nearest integer.

> **Note:** The default `repair_modifier` score is **100** (no repair history recorded = best case assumption). It is only reduced if the technician records specific repair events during the QC session.

### Risk Flags

After scoring, per-category risk flags are set:

```csharp
foreach (var (category, threshold) in config.RiskThresholds) {
    riskFlags[category] = categoryScores[category] < threshold;
}
```

Default risk thresholds (from `PramaanScoringConfig.cs`):

| Category | Threshold |
|---|---|
| `storage` | < 40 |
| `thermal` | < 40 |
| `battery` | < 35 |
| `cpu_ram` | < 30 |
| `physical_ports` | < 50 |
| `repair_modifier` | < 50 |

### Grade Band Assignment

The final grade is assigned by comparing the score against ordered `GradeBand` thresholds:

| Grade | Minimum Score |
|---|---|
| A+ | 90 |
| A | 80 |
| B | 65 |
| C | 50 |
| Reject | 0 (score < 50) |

---

## Algorithm Versioning

Every scored result stores:

```json
"pramaanAlgorithmVersion": "Scoring Engine v1.0.3"
```

This string is built at runtime as `"Scoring Engine v" + config.Version`. The `config.Version` field comes from `PramaanScoringConfig.Version` (default `"1.0.3"`), which the API can override. It enables:

- Historical comparisons that account for config changes
- Audits that trace which exact configuration produced a given score
- Invalidation logic if a config version is later found to have an error

---

## Config Update Flow (No Software Update Required)

```
Gadget Guruz admin changes weights on dashboard
           ↓
PUT /api/pramaan/config  (SuperAdmin only)
           ↓
Next QC run: PramaanConfigService.GetActiveConfigAsync()
           ↓
New weights applied automatically
AlgorithmVersion incremented
```

Weight and threshold changes never require deploying a new CLI or desktop app binary.

---

## Auto QC (`--auto-basic-qc`)

For background Auto QC runs, the CLI runs a headless diagnostic pass (CPU, RAM, storage, battery + SMART) without any interactive technician tests. Keyboard, trackpad, USB, and audio tests are skipped since no technician is present.

The result is submitted to the machine history API as `source: "auto_basic_qc"`. See [CLI Reference](cli-reference.md) and [API Reference](api-reference.md) for the `/api/machine-history` endpoint details.

---

*← Back to [Documentation Index](../README.md)*
