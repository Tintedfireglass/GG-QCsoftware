# Server Agent (Linux)

> **Audience:** DevOps, Infrastructure engineers  
> **Classification:** Internal

---

## Overview

The **Pramaan Agent** is a headless monitoring mode built into the same `pramaan` binary used for laptop QC. In agent mode, it collects Linux server health metrics and pushes them to the Pramaan Dashboard API. It is designed for unattended, scheduled operation.

Agent mode is distinct from laptop QC — it does not run stress tests or SMART diagnostics. Instead, it focuses on operational server metrics: CPU load, memory pressure, disk utilization, network reachability, systemd service health, and NTP sync status.

---

## Quick Start

### 1. Enroll the Server

```bash
pramaan agent enroll \
  --license YOUR-LICENSE-KEY \
  --serial YOUR-SERVER-SERIAL
```

This saves credentials to `~/.pramaan/agent.json` and validates the license with the API. On success it prints: `Enrolled. machineId=<N>`

### 2. Test a Health Check

```bash
# Human-readable output
pramaan agent check

# JSON output (for scripting)
pramaan agent check --json
```

### 3. Push Results to Cloud

```bash
pramaan agent push
```

### 4. Set Up Automatic Reporting

Install as a systemd timer for fully automated monitoring:

```bash
sudo pramaan --install-background
```

This creates and enables both `pramaan-autoqc.timer` (weekly laptop QC) and `pramaan-heartbeat.timer` (4-hourly ping). For pure server monitoring, you can create a custom timer targeting `pramaan agent push`.

---

## Health Checks Performed

The agent runs 7 checks every time it collects:

### 1. `identity`
Confirms the server is reachable and collects basic identity info.
- Hostname
- OS version (from `/etc/os-release`)
- System uptime (from `uptime -p`)

### 2. `cpu`
Reads CPU load averages from `/proc/loadavg`.

| Metric | Source |
|---|---|
| `load1` | 1-minute load average |
| `load5` | 5-minute load average |
| `load15` | 15-minute load average |
| `cores` | `Environment.ProcessorCount` |

**Status thresholds (configurable via `agent.json`):**
- `Ok`: load1 < `LoadWarnPerCore × cores`
- `Degraded`: load1 ≥ `LoadWarnPerCore × cores`
- `Critical`: load1 ≥ `LoadCritPerCore × cores`

### 3. `memory`
Reads `/proc/meminfo` for memory and swap stats.

| Metric | Source |
|---|---|
| `mem_total_kb` | `MemTotal` |
| `mem_available_kb` | `MemAvailable` |
| `mem_used_pct` | `(1 - available/total) × 100` |
| `swap_total_kb` | `SwapTotal` |
| `swap_used_pct` | Swap used percentage |

**Status thresholds:** `MemWarnPercent` / `MemCritPercent` (default: 85% / 95%)

### 4. `disk`
Runs `df -P -T` to check all mounted filesystems.

- Skips `tmpfs` and `devtmpfs`
- Tracks worst disk usage percentage across all real filesystems
- Reports per-mount usage in `Details`

**Status thresholds:** `DiskWarnPercent` / `DiskCritPercent` (default: 80% / 90%)

### 5. `network`
Checks basic network connectivity:

1. **Default route** — `ip route` output contains `default`
2. **DNS resolution** — `getent hosts <DnsTestDomain>` (default: google.com)
3. **Reachability URLs** — TCP connect to configured `ReachabilityUrls` (each within 1500 ms)

**Status:** `Degraded` if no default route or DNS fails; also `Degraded` if all reachability URLs fail.

### 6. `services`
Checks the status of configured systemd units (defined in `ServiceUnits` in `agent.json`).

```json
"ServiceUnits": ["nginx.service", "postgresql.service", "myapp.service"]
```

Runs `systemctl is-active <unit>` for each. Status is `Critical` if any unit is `failed`, `inactive`, or `unknown`.

### 7. `time_sync`
Checks NTP synchronization status via `timedatectl show -p NTPSynchronized --value`.

- `Ok` if output is `yes`
- `Degraded` if output is `no`
- `Unknown` if `timedatectl` is unavailable

---

## Overall Status Aggregation

The `OverallStatus` is the worst status across all 7 checks:

```
Critical > Degraded > Unknown > Ok
```

---

## JSON Output Format

`pramaan agent check --json` outputs:

```json
{
  "schema_version": "1.0",
  "collected_at": "2026-05-18T14:30:00Z",
  "agent_version": "1.0.0.0",
  "overall_status": "ok",
  "checks": [
    {
      "name": "cpu",
      "status": "ok",
      "summary": "load1=0.24 load5=0.31 load15=0.28 (cores=8)",
      "metrics": {
        "load1": 0.24,
        "load5": 0.31,
        "load15": 0.28,
        "cores": 8
      },
      "details": []
    },
    {
      "name": "disk",
      "status": "degraded",
      "summary": "worst_used=83%",
      "metrics": { "worst_used_pct": 83.0 },
      "details": [
        "/ used=83% fs=/dev/sda1",
        "/data used=45% fs=/dev/sdb1"
      ]
    }
  ]
}
```

---

## Exit Codes

| Exit Code | Meaning |
|---|---|
| `0` | All checks Ok |
| `1` | One or more checks Degraded |
| `2` | One or more checks Critical |
| `3` | Error (not enrolled, auth failure, unexpected error) |

These exit codes make the agent scriptable with standard monitoring tools.

---

## Configuration Reference

Config file path: `~/.pramaan/agent.json` (default)

Override with: `pramaan agent check --config /etc/pramaan/agent.json`

```json
{
  "ApiUrl": "https://pramaan-dashboard.gadgetguruz.com/api",
  "LicenseKey": "XXXX-XXXX-XXXX",
  "MachineSerial": "SRV001",
  "MacAddress": "aa:bb:cc:dd:ee:ff",
  "ComputerName": "prod-server-01",
  "ServiceUnits": [
    "nginx.service",
    "postgresql.service",
    "redis.service"
  ],
  "ReachabilityUrls": [
    "https://pramaan-dashboard.gadgetguruz.com",
    "https://api.gadgetguruz.com"
  ],
  "DnsTestDomain": "google.com",
  "DiskWarnPercent": 80,
  "DiskCritPercent": 90,
  "MemWarnPercent": 85,
  "MemCritPercent": 95,
  "LoadWarnPerCore": 1.0,
  "LoadCritPerCore": 2.0
}
```

---

## Integration with Monitoring Systems

Since `pramaan agent check --json` outputs structured JSON and uses standard exit codes, it integrates with:

| System | Integration method |
|---|---|
| **Nagios / Icinga** | Use as a check plugin; read exit code |
| **Prometheus** | Parse JSON output with a custom exporter |
| **Grafana** | Display `pramaan_score` metrics from the Pramaan Dashboard API |
| **Alertmanager** | Alert on exit code 2 (Critical) from scheduled job |
| **Cron / systemd timer** | `pramaan agent push` on a schedule |

---

## Setting Up a Custom systemd Timer (Agent Push)

```ini
# /etc/systemd/system/pramaan-agent.service
[Unit]
Description=Pramaan Server Health Push
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/bin/pramaan agent push
User=root

# /etc/systemd/system/pramaan-agent.timer
[Unit]
Description=Run Pramaan Agent health push every hour

[Timer]
OnBootSec=5min
OnUnitActiveSec=1h
AccuracySec=5m

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pramaan-agent.timer
```

---

*← Back to [Documentation Index](../README.md)*
