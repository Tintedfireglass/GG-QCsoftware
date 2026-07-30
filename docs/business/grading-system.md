# Grading & Certification System

> **Audience:** Operations managers, QC managers, business stakeholders  
> **Classification:** Internal

---

## Overview

Every device tested by Pramaan receives two outputs:

1. **Overall Pass/Fail** — Did the device meet minimum quality standards?
2. **Pramaan Health Score + Grade Band** — A precise, 0–100 quality score mapped to a grade (A+ through Reject).

Both outputs are deterministic — the same device hardware state will always produce the same score and grade for a given algorithm version.

---

## The Pramaan Score (0–100)

The **Pramaan Score** is a weighted composite of 6 hardware categories. Each category is independently scored 0–100, then combined using configurable weights.

### Default Category Weights

| Category | Default Weight | What It Measures |
|---|---|---|
| **Storage** | 25% | SMART health, temperature, self-test result |
| **Thermal** | 20% | CPU peak temp during stress, GPU temp, throttling |
| **Battery** | 25% | Health percentage, cycle count, wear level |
| **CPU & RAM** | 15% | CPU info health, RAM stress pass/fail |
| **Physical Ports** | 5% | USB, Audio jack, display output test results |
| **Repair Modifier** | 10% | Manual technician-recorded repair history |

> **Note:** Weights are configurable by Gadget Guruz without a software update — they're loaded from the cloud API at runtime. Each result stores the `algorithm_version` so historical comparisons remain valid.

---

## Grade Bands

| Grade | Label | Min Score |
|---|---|---|
| **A+** | Certified Premium | 90 |
| **A** | Certified | 80 |
| **B** | Good Condition | 70 |
| **C** | Acceptable | 60 |
| **D** | Below Average | 50 |
| **Reject** | Not Certified | 0 (score < 50) |

---

## Risk Flags

In addition to the score, the system generates **per-category risk flags** if a category falls below its configured threshold. Risk flags appear on reports and the dashboard to highlight which specific areas are problematic.

| Category | Default Risk Threshold |
|---|---|
| Storage | < 40 |
| Thermal | < 40 |
| Battery | < 35 |
| CPU & RAM | < 30 |
| Physical Ports | < 50 |
| Repair Modifier | < 50 |

---

## How Individual Components Are Scored

### Storage Score
- SMART health % is read directly from `smartctl` — used as the per-drive score (0–100)
- Drives are weighted by capacity (GB) to produce a single machine-level storage score
- Temperature penalty applied per drive: ≤ 45°C → no penalty; > 45°C → −4; > 50°C → −10; > 55°C → −20; > 60°C → −35
- SMART self-test failure → −30 points and score capped at 45
- All-eMMC devices without health data → capped at 80
- RAID: degraded array (missing drives) → critical penalty

### Battery Score
| Battery Health | Base Score |
|---|---|
| ≥ 90% | 100 |
| ≥ 80% | 85 |
| ≥ 70% | 70 |
| ≥ 60% | 55 |
| ≥ 50% | 40 |
| < 50% | 20 |

Cycle count penalty: high cycle counts deduct from the base score.

### CPU & RAM Score
- CPU stress test pass → high points; stress test fail → low points
- RAM stress test pass → high points; stress test failure or errors → low points
- Thermal throttle during CPU stress test reduces the thermal category score (separate from cpu_ram)

### Thermal Score
- Based on the verdict keyword present in the CPU stress test message (`CpuTest.Message`)
- `EXCELLENT` → 100, `PASS` → 100, `WARNING` → 50, `FAIL` → 20, `CRITICAL` → 5
- GPU thermal scored separately from max temperature in stress test details and averaged with CPU thermal
- If no discrete GPU is detected, only the CPU thermal score is used

### Physical Ports Score
- USB test pass → points
- Audio jack test pass → points
- Trackpad test pass → points
- Keyboard test pass → points

### Repair Modifier
- Entered by the technician during the QC session
- Default score if no repair info recorded: **100** (best-case assumption — no known repairs)
- Known repairs reduce the modifier score based on severity (Saarthi integration, future)

---

## Overall Pass / Fail

A device is marked **Overall Pass** if its Pramaan Score ≥ 50 (the minimum score for grade C). Devices scoring below 50 receive a **Reject** grade and are not eligible for resale certification.

---

## Certification Report

Once a QC run is complete, Pramaan automatically generates a **certification HTML report**:

- Contains full hardware snapshot (CPU, RAM, storage, battery details)
- Displays Pramaan Score + Grade Band prominently
- Includes a **QR code** linking to the public verification page
- SHA-256 hash of the full report is embedded — any modification to the data is detectable
- Accessible via: `https://pramaan-dashboard.gadgetguruz.com/verify/<healthId>`

The verification page is **publicly accessible** — buyers can scan the QR code to independently confirm the device's certification status.

---

## Algorithm Versioning

Every scored result records a `pramaan_algorithm_version` field. This means:

- Historical results remain interpretable even if scoring weights change
- Grade trends over time account for algorithm changes
- Audits can reconstruct exactly which config version produced a given score

---

*← Back to [Documentation Index](../README.md)*
