# CLI Reference

> **Audience:** Technicians, DevOps, Infra engineers  
> **Classification:** Internal

---

## Overview

The **Pramaan CLI** is a standalone Linux x64 binary (`pramaan`) that provides hardware diagnostics, stress testing, and server monitoring in both interactive and headless modes.

**Binary location (after installation):** `/usr/bin/pramaan` (or wherever extracted)  
**Version:** 1.0.0 (linux-x64)  
**Runtime:** Self-contained .NET 8 — no separate runtime installation required

---

## Interactive Mode

```bash
pramaan
```

Launches the interactive TUI dashboard. Use **↑/↓ arrow keys** to navigate, **Enter** to confirm, **Q** or **Escape** to quit.

### Menu Options

| Option | Description |
|---|---|
| Run Full QC | Runs all automated + interactive tests via QC Wizard |
| Run Diagnostics Only | Hardware detection without stress tests |
| Run Stress Tests Only | CPU, RAM, GPU stress tests without detection |
| View Results Table | Shows current session results in a formatted table |
| Settings | (Placeholder — not yet implemented) |
| Exit | Quit the application |

---

## Non-Interactive (Headless) Flags

| Flag | Alias | Description |
|---|---|---|
| `--help` | `-h` | Show help message and exit |
| `--version` | `-v` | Show version string and exit |
| `--diagnose` | `-d` | Run hardware diagnostics only, print results to stdout |
| `--stress` | `-s` | Run stress tests only, print results to stdout |
| `--full-qc` | `-f` | Run full QC (diagnostics + stress), print results to stdout |
| `--heartbeat` | — | Send online heartbeat to the cloud API |
| `--auto-basic-qc` | — | Run silent weekly QC and submit to cloud (no UI) |
| `--install-background` | — | Install systemd timers (must be run as root) |

### Examples

```bash
# Run full QC non-interactively and print score
pramaan --full-qc

# Diagnostics only — good for CI/CD checks
pramaan --diagnose

# Stress tests only
pramaan --stress

# Manual heartbeat (requires prior authentication)
pramaan --heartbeat

# Install background services (requires sudo)
sudo pramaan --install-background
```

---

## Agent Mode

The `agent` subcommand enables headless server health monitoring, distinct from laptop QC.

```bash
pramaan agent <subcommand> [options]
```

### Subcommands

| Subcommand | Description |
|---|---|
| `enroll` | Register this server with the Pramaan API using a license key |
| `check` | Run server health checks and print results to stdout |
| `push` | Run health checks and push results to the cloud API |
| `heartbeat` | Refresh license authentication (keep machine active) |

### Agent Flags

| Flag | Description |
|---|---|
| `--license <key>` | License key for enrollment |
| `--serial <serial>` | Machine serial number for enrollment |
| `--api <url>` | Override API base URL |
| `--config <path>` | Path to agent config JSON file |
| `--json` | Output health check results as JSON (for `check` subcommand) |

### Agent Examples

```bash
# Enroll this server with a license key
pramaan agent enroll --license XXXX-XXXX-XXXX --serial SRV001

# Run a health check and print human-readable output
pramaan agent check

# Run and output JSON (for scripting/monitoring integration)
pramaan agent check --json

# Run health check and push to cloud
pramaan agent push

# Heartbeat (license refresh)
pramaan agent heartbeat
```

### Agent Exit Codes

| Code | Meaning |
|---|---|
| `0` | OK — all checks healthy |
| `1` | Degraded — one or more checks in warning state |
| `2` | Critical — one or more checks in critical state |
| `3` | Error — not enrolled, auth failure, or unexpected error |

---

## Agent Configuration File

The agent config is stored at `~/.pramaan/agent.json` by default.

```json
{
  "ApiUrl": "https://pramaan-dashboard.gadgetguruz.com/api",
  "LicenseKey": "your-license-key",
  "MachineSerial": "SRV001",
  "MacAddress": "aa:bb:cc:dd:ee:ff",
  "ComputerName": "my-server",
  "ServiceUnits": ["nginx.service", "postgresql.service"],
  "ReachabilityUrls": ["https://pramaan-dashboard.gadgetguruz.com"],
  "DnsTestDomain": "google.com",
  "DiskWarnPercent": 80,
  "DiskCritPercent": 90,
  "MemWarnPercent": 85,
  "MemCritPercent": 95,
  "LoadWarnPerCore": 1.0,
  "LoadCritPerCore": 2.0
}
```

### Configuration Options

| Key | Default | Description |
|---|---|---|
| `ApiUrl` | `https://pramaan-dashboard.gadgetguruz.com/api` | Pramaan API base URL |
| `LicenseKey` | — | License key (set via `enroll`) |
| `MachineSerial` | — | Server serial identifier |
| `MacAddress` | Auto-detected | MAC address |
| `ComputerName` | Auto-detected | Hostname |
| `ServiceUnits` | `[]` | systemd units to check (e.g., `nginx.service`) |
| `ReachabilityUrls` | `[]` | URLs to TCP-probe for connectivity checks |
| `DnsTestDomain` | `google.com` | Domain to resolve for DNS check |
| `DiskWarnPercent` | `80` | Disk usage % to trigger Degraded status |
| `DiskCritPercent` | `90` | Disk usage % to trigger Critical status |
| `MemWarnPercent` | `85` | Memory usage % to trigger Degraded |
| `MemCritPercent` | `95` | Memory usage % to trigger Critical |
| `LoadWarnPerCore` | `1.0` | Load average per core for Degraded |
| `LoadCritPerCore` | `2.0` | Load average per core for Critical |

---

## Background Services (systemd)

Running `sudo pramaan --install-background` creates and enables two systemd timer pairs:

### `pramaan-heartbeat.timer`
- **Frequency:** Every 4 hours (first run 15 min after boot)
- **Action:** `pramaan --heartbeat`
- **Purpose:** Keeps the machine's license active; updates `last_seen` in the dashboard

### `pramaan-autoqc.timer`
- **Frequency:** Weekly
- **Action:** `pramaan --auto-basic-qc`
- **Purpose:** Runs a silent hardware diagnostic (CPU, RAM, Storage, Battery + SMART) and submits results to the cloud automatically

### Checking timer status
```bash
systemctl status pramaan-heartbeat.timer
systemctl status pramaan-autoqc.timer
systemctl list-timers | grep pramaan
```

---

## Session & Data Storage

| Data | Path |
|---|---|
| Auth session | `~/.pramaan/session.json` |
| Agent config | `~/.pramaan/agent.json` |
| Device ID registry | `~/.pramaan/device_registry.json` |
| Recent reports | `~/.pramaan/recent_reports.json` |
| smartctl binary | Bundled in same directory as `pramaan` binary |

---

*← Back to [Documentation Index](../README.md)*
