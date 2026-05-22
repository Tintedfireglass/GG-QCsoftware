# Diagnostics Engine

> **Audience:** Backend and systems engineers  
> **Classification:** Internal

---

## Overview

The Pramaan diagnostics engine runs a suite of hardware tests to collect health data from the machine under test. The engine is implemented separately for Linux (CLI) and Windows (desktop app + Core library), with a shared data model (`QCReport`) used across both platforms.

---

## Diagnostic Modules (Linux CLI)

All Linux diagnostic modules live in `cli/Diagnostics/`.

### LinuxCpuDiagnostic
**File:** `cli/Diagnostics/LinuxCpuDiagnostic.cs`

Reads CPU information from `/proc/cpuinfo` and system calls.

**Collected data:**
- CPU model name
- Physical core count
- Logical thread count
- Maximum frequency (MHz)

**Validation:** Checks that core count > 0 and CPU model is not unknown.

---

### LinuxRamDiagnostic
**File:** `cli/Diagnostics/LinuxRamDiagnostic.cs`

Reads RAM information from `/proc/meminfo`.

**Collected data:**
- Total RAM (GB)
- Available RAM
- Memory type (DDR3/DDR4/DDR5 — best effort via `dmidecode`)

**Validation:** Minimum 2 GB total RAM required to pass.

---

### LinuxStorageDiagnostic
**File:** `cli/Diagnostics/LinuxStorageDiagnostic.cs`

Uses `lsblk --json` to enumerate block devices.

**Collected data:**
- Device ID (e.g., `/dev/nvme0n1`, `/dev/sda`)
- Vendor model name (from `lsblk` model field or overwritten by SMART data)
- Serial number
- Size in GB
- Device type (HDD/SSD/NVMe)

**RAID detection:**
- Software RAID: Parses `/proc/mdstat` for md device arrays
- Flags degraded arrays (missing drives) as issues

---

### LinuxSmartTestService
**File:** `cli/Diagnostics/LinuxSmartTestService.cs`

The most complex diagnostic module. Wraps the bundled `smartctl` binary to read SMART data.

**Capabilities:**
- `IsAvailable` — checks if `smartctl` binary is accessible
- `QuickHealthCheck()` — reads health status for all detected drives
- SMART short self-test — runs and polls until complete (~2–5 min)
- Hardware RAID passthrough — supports PERC/MegaRAID via `-d megaraid,N`

**Per-drive data collected:**
- Model name (overrides lsblk placeholder names)
- Serial number
- Health status (`PASSED` / `FAILED`)
- Health score (%)
- Temperature (°C)
- Power-on hours
- Device type (for RAID passthrough)

**NVMe support:**
- Parses NVMe-specific SMART log format (0-indexed entries)
- Detects in-progress self-tests via "Self-test routine in progress" status

---

### LinuxBatteryDiagnostic
**File:** `cli/Diagnostics/LinuxBatteryDiagnostic.cs`

Reads battery data from `/sys/class/power_supply/`.

**Collected data:**
- Health percentage (`capacity`)
- Cycle count (from `cycle_count` if available)
- Battery status (Charging/Discharging/Full)
- Design capacity vs actual capacity (wear level)

**Validation:** Flags battery as failing if health < 30% or cycle count exceeds threshold.

---

### LinuxCpuStressTest
**File:** `cli/Diagnostics/LinuxCpuStressTest.cs`

Runs a multi-threaded CPU stress test.

**Implementation:**
- Spawns N threads (one per logical CPU)
- Each thread performs tight mathematical computations for `durationSeconds` (default: 15s)
- Monitors CPU temperature via `/sys/class/thermal/thermal_zone*/temp`
- Reports progress via `OnProgress` event

**Thermal throttle detection:**
- Compares frequency before vs. during stress via `/proc/cpuinfo`
- Classifies result as EXCELLENT / GOOD / WARNING / CRITICAL based on temperature bands

---

### LinuxRamStressTest
**File:** `cli/Diagnostics/LinuxRamStressTest.cs`

Allocates and verifies a large memory buffer.

**Implementation:**
- Allocates `testSizeMB` MB (default: 512 MB)
- Writes a known pattern across the buffer
- Reads back and verifies for `iterations` iterations (default: 2)
- Reports any detected bit errors

---

### LinuxGpuStressTest
**File:** `cli/Diagnostics/LinuxGpuStressTest.cs`

Runs a GPU stress test using available compute APIs.

**Implementation:**
- Detects GPU via `/sys/class/drm/` and `lspci`
- Uses OpenCL (via platform detection) or falls back to CPU-based GPU proxy
- Monitors GPU temperature via hwmon sysfs paths
- Reports max temperature and any throttle events

---

### LinuxDeviceDiagnostic
**File:** `cli/Diagnostics/LinuxDeviceDiagnostic.cs`

Collects information about peripheral devices.

**Collected data:**
- Network adapters (WiFi, Ethernet) with connection status and MAC address
- USB controllers
- Audio devices
- Display output detection

**Network validation:** At least one active WiFi or Ethernet adapter required to pass.

---

### LinuxSystemDiagnostic
**File:** `cli/Diagnostics/LinuxSystemDiagnostic.cs`

Reads system-level identification information.

**Collected data:**
- Hostname / computer name
- OS version (`/etc/os-release`)
- BIOS serial number (`/sys/class/dmi/id/board_serial` or `product_serial`)
- MAC address of primary network interface

---

### LinuxCommandRunner
**File:** `cli/Diagnostics/LinuxCommandRunner.cs`

Helper utility used by all diagnostics. Wraps `Process.Start()` for shell command execution.

**Methods:**
- `TryRun(command, args)` — runs command, returns stdout or empty string on failure
- `RunSingleLine(command, args)` — returns first non-empty output line
- `ReadFile(path)` — reads a virtual file (e.g., `/proc/meminfo`)

---

## Windows Diagnostic Modules (Core Library)

Windows diagnostics live in `src/LaptopQC.Core/Diagnostics/` and `src/LaptopQC.Hardware/`.

### Hardware Providers (Windows)

| Provider | Source | What It Reads |
|---|---|---|
| `LibreHardwareMonitor` | NuGet: LibreHardwareMonitorLib | CPU temp, GPU temp/load/clock, SSD health %, power-on hours, battery |
| `WmiProvider.cs` | System.Management (WMI) | CPU, RAM, Disk, Battery, USB, Video, Audio, Network via Win32_* classes |
| `SmartctlProvider.cs` | Bundled `smartctl.exe` | NVMe/SATA SMART data, self-tests |
| `PerformanceCounter` | System.Diagnostics | CPU frequency estimation fallback |

### Key WMI Classes Queried

| WMI Class | Data Retrieved |
|---|---|
| `Win32_Processor` | CPU model, cores, threads, base clock |
| `Win32_PhysicalMemory` | RAM modules, capacity, speed |
| `Win32_DiskDrive` | Drive model, serial, size |
| `Win32_Battery` | Battery health, design capacity |
| `Win32_NetworkAdapterConfiguration` | MAC address, IP |
| `Win32_VideoController` | GPU model |
| `Win32_SoundDevice` | Audio devices |
| `Win32_USBController` | USB controllers |
| `MSAcpi_ThermalZoneTemperature` | CPU thermal zone |

---

## QC Workflow Phases

The QC wizard (`QCWorkflowService.RunAutomatedChecksAsync()`) progresses through defined steps:

```
QCWorkflowStep.Preparation
       ↓
QCWorkflowStep.AutomatedChecks       ← No user input needed
  • CPU detection + stress
  • RAM detection + stress
  • Storage detection + SMART
  • Battery health
  • GPU stress
  • System info
       ↓
QCWorkflowStep.InteractiveTests      ← Technician input required
  • Keyboard, Trackpad, USB
  • Audio/Video, Audio Jack
  • Network connectivity
       ↓
QCWorkflowStep.ReportGeneration
  • PramaanScoringEngine.ScoreReport()
  • SHA-256 hash computed
  • HTML report generated
       ↓
QCWorkflowStep.Complete
  • QCSubmissionService.SubmitReportAsync()
```

---

## QCReport Data Model

`QCReport` (defined in `src/LaptopQC.Core/Models/QCReport.cs`) is the central data object that accumulates all test results.

**Key fields:**

| Field | Type | Description |
|---|---|---|
| `ReportId` | `string` (GUID) | Unique identifier for this QC run |
| `Timestamp` | `DateTime` | When the test was run (UTC) |
| `AppVersion` | `string` | Version of the Pramaan app |
| `SystemInfo` | `SystemInfo` | Hostname, OS, serial, MAC |
| `CpuDetails` | `CpuInfo` | CPU model, cores, frequency |
| `RamDetails` | `RamInfo` | Total RAM, module info |
| `StorageDetails` | `StorageInfo` | Drive list, RAID arrays |
| `BatteryDetails` | `BatteryInfo` | Health %, cycle count |
| `DeviceDetails` | `DeviceInfo` | Network adapters, peripherals |
| `CpuTest` | `TestResult` | CPU test result with score |
| `RamTest` | `TestResult` | RAM test result with score |
| `StorageTest` | `TestResult` | Storage test result with score |
| `BatteryTest` | `TestResult` | Battery test result with score |
| `GpuTest` | `TestResult` | GPU test result with score |
| `NetworkTest` | `TestResult` | Network test result with score |
| `KeyboardTest` | `TestResult` | Keyboard manual test result |
| `TrackpadTest` | `TestResult` | Trackpad manual test result |
| `UsbTest` | `TestResult` | USB manual test result |
| `AudioVideoTest` | `TestResult` | Audio/Video manual test result |
| `AudioJackTest` | `TestResult` | Audio jack manual test result |
| `PramaanResult` | `PramaanResult` | Score, grade, risk flags |
| `DiagnosticHash` | `string` | SHA-256 of full report JSON |
| `OverallScore` | `int` | Always 0 (replaced by `PramaanResult.OverallHealthScore`) |
| `OverallGrade` | `string` | Final grade (A+/A/B/C/Reject) |
| `OverallPass` | `bool` | Score >= 40 |

---

*← Back to [Documentation Index](../README.md)*
