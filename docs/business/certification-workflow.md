# Device Certification Workflow

> **Audience:** QC Technicians, QC Managers, Operations  
> **Classification:** Internal

---

## Overview

This document describes the end-to-end process for certifying a refurbished device using Pramaan — from initial setup to the final certificate issued to the buyer.

---

## Prerequisites

Before starting, ensure the following:

- [ ] A valid Pramaan license key (or active free trial)
- [ ] Pramaan CLI installed on the Linux machine, or the Windows desktop app installed
- [ ] The device to be certified is powered on and accessible
- [ ] Network connectivity (required to submit results)
- [ ] For SMART diagnostics: `smartctl` is available (bundled with the Linux CLI)

---

## Step 1 — Launch Pramaan

### Linux CLI
```bash
./pramaan
```
The interactive TUI dashboard will open. Navigate with **↑/↓ arrow keys**, confirm with **Enter**.

### Windows Desktop App
Double-click `Pramaan.exe` or launch from the Start menu. The dashboard opens automatically.

---

## Step 2 — Authenticate

On first launch (or if the session has expired), you will be prompted to enter your license key. The application validates the key with the cloud API and stores the session locally.

If you are on a free trial, the trial session is detected automatically — no manual key entry needed.

---

## Step 3 — Select a QC Mode

From the main menu, choose one of:

| Option | Description | Duration |
|---|---|---|
| **Full QC** | Automated diagnostics + stress tests + interactive tests | ~10–20 min |
| **Diagnostics Only** | Hardware detection only (no stress tests) | ~2–3 min |
| **Stress Tests Only** | CPU, RAM, GPU stress only (no detection) | ~5–10 min |

> For certification purposes, always run **Full QC**. Diagnostics Only or Stress Tests Only are for debugging and partial checks.

---

## Step 4 — Automated Tests (No Intervention Required)

The following tests run automatically in sequence:

| Test | What Happens |
|---|---|
| **CPU Detection** | Reads CPU model, core count, frequency |
| **CPU Stress Test** | Runs a 15-second multi-core load; detects thermal throttling |
| **RAM Detection** | Reads installed RAM, channel configuration, speed |
| **RAM Stress Test** | Writes and verifies 512 MB of memory data for 2 iterations |
| **Storage Detection** | Lists all drives via `lsblk` with model names and capacity |
| **SMART Health Check** | Reads drive health percentage, temperature, power-on hours |
| **SMART Short Self-Test** | Runs the drive's built-in short self-test (~2–5 min for HDD/SSD) |
| **Battery Health** | Reads battery percentage, cycle count, wear level |
| **GPU Stress Test** | Runs a 15-second GPU compute load; monitors temperature |
| **Network Check** | Checks for active WiFi and/or Ethernet connection |

> For RAID servers: software RAID arrays are checked via `/proc/mdstat`; hardware RAID drives are tested via SMART passthrough.

---

## Step 5 — Interactive Tests (Technician Required)

After automated tests complete, the QC Wizard prompts the technician to manually verify:

| Test | Instructions |
|---|---|
| **Keyboard** | Type all keys; confirm all register correctly |
| **Trackpad** | Move cursor; test click, right-click, scroll |
| **USB Ports** | Plug a USB device into each port; confirm detection |
| **Audio/Video** | Play audio through speakers; test microphone recording |
| **Audio Jack** | Plug in headphones; confirm audio routes correctly |
| **Display** | Technician visually inspects for dead pixels, backlight issues |

For each test, the technician marks it as **Pass** or **Fail**.

---

## Step 6 — Review Results

When all tests are complete, the QC Wizard presents a summary table:

```
┌─────────────┬──────────────────────┬────────────┬───────────┬────────────────────────┐
│ Component   │ Test                 │ Result     │ Score     │ Details                │
├─────────────┼──────────────────────┼────────────┼───────────┼────────────────────────┤
│ CPU         │ Detection + Stress   │ ✓ PASS     │ 85/100    │ Intel Core i5-1135G7   │
│ RAM         │ Detection + Stress   │ ✓ PASS     │ 90/100    │ 16 GB DDR4-3200        │
│ Storage     │ SMART + Self-Test    │ ✓ PASS     │ 78/100    │ 2 drives healthy       │
│ Battery     │ Health Check         │ ✓ PASS     │ 72/100    │ 76% health, 312 cycles │
│ GPU         │ Stress Test          │ ✓ PASS     │ 88/100    │ Max Temp: 71.4°C       │
│ Network     │ Connectivity         │ ✓ PASS     │ 100/100   │ WiFi connected         │
│ Keyboard    │ Manual Test          │ ✓ PASS     │ 100/100   │ All keys functional    │
│ Trackpad    │ Manual Test          │ ✓ PASS     │ 100/100   │ Touch & click OK       │
│ USB Ports   │ Manual Test          │ ✓ PASS     │ 100/100   │ All 3 ports detected   │
│ Audio/Video │ Manual Test          │ ✓ PASS     │ 100/100   │ Speaker & mic OK       │
└─────────────┴──────────────────────┴────────────┴───────────┴────────────────────────┘

Overall Score: 84/100   Grade: A   ✓ CERTIFIED
```

---

## Step 7 — Submit to Cloud

The app automatically submits the complete result to the Pramaan Dashboard via the cloud API. Submission includes:

- Full hardware snapshot (CPU, RAM, storage, battery, device details)
- All test results with scores
- System info (serial number, MAC address, model, manufacturer)
- Pramaan Score + Grade Band + Risk Flags
- SHA-256 tamper-evident hash

If the submission succeeds, a **Health ID** is assigned to the result. If network is unavailable at the time of testing, the result can be submitted later via the "Recent Reports" panel.

---

## Step 8 — Generate Certificate

A certification HTML report is automatically generated and includes:

- Device details (model, serial, manufacturer)
- All test results with scores and grade breakdown
- Pramaan Score + Grade prominently displayed
- **QR code** linking to the public verification page
- Date, time, and technician reference

### Public Verification
The buyer or any third party can scan the QR code (or visit the URL directly) to verify the certificate:

```
https://pramaan-dashboard.gadgetguruz.com/verify/<healthId>
```

This page shows:
- Device identity (model, serial — last 4 digits only for privacy)
- Pramaan Grade and Score
- Test date
- The certification is confirmed as valid (the SHA-256 hash matches)

---

## Non-Interactive Mode (Headless / Automated)

For automated deployment pipelines, Pramaan CLI supports non-interactive flags:

```bash
# Run full QC and print results to stdout
./pramaan --full-qc

# Diagnostics only (no stress tests)
./pramaan --diagnose

# Stress tests only
./pramaan --stress
```

For scheduled background checks, install systemd timers:
```bash
sudo ./pramaan --install-background
```

This sets up:
- **Heartbeat** — runs every 4 hours to confirm device is online
- **Auto Basic QC** — runs weekly diagnostic + SMART check and submits to cloud automatically

---

*← Back to [Documentation Index](../README.md)*
