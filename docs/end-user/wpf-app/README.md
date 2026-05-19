# Windows Desktop App (WPF) — End-User Guide

The Pramaan Windows Desktop App is what technicians use on the device being certified. It is designed for consistent, repeatable QC with a clear output (certificate/report) and optional cloud submission.

At a high level, it helps you:

- Collect device identity (serial, model, etc.)
- Run automated diagnostics
- Complete guided manual checks (keyboard, trackpad, USB, A/V, network)
- Produce a **local certificate/report**
- Submit results to the server (when activated/logged in and online) so they appear in the Web Dashboard

---

## First-time setup / activation

When the app starts (or when submission is needed), you may see an **Activation** window.

You typically have three options:

1) **Enter a license key**  
Use this when your organization has provided a license key for production use.

2) **Start a free trial (7 days)**  
Use this for evaluation or demo workflows. Trials are typically limited to one per email/device.

3) **Skip — work offline**  
Use this if:
- You are in a restricted network environment, or
- You need to generate a local report only

Important: Working offline usually means the result will **not** appear in the Web Dashboard until it is submitted (if/when your workflow allows).

---

## Main screens you will see

### 1) Main Window

Purpose: quick access to QC actions and a view of system info.

You’ll typically see:
- System identity fields (computer name, model, serial, MAC, etc.)
- Primary actions (Full QC, Basic QC, Cleanup)
- Result cards/tiles that populate as checks run

### 2) QC Wizard

Purpose: the guided, end-to-end certification flow.

This is the recommended way to certify a device because it:
- Runs automated checks in a consistent way
- Ensures manual checks are not skipped
- Produces a report and submission attempt as part of completion

Full flow details:
- [QC Wizard (End-to-End Flow)](./qc-wizard.md)

### 3) Manual test windows

Purpose: individual operator-validated checks (keyboard, trackpad, USB, etc.).

These can be launched:
- Automatically from the QC Wizard, or
- Manually from the Main Window “Test” buttons

Manual test instructions:
- [Manual Test Windows](./manual-tests.md)

---

## Main Window actions (what each one does)

### Full QC

Use when: you are certifying a device and want the full guided workflow.

What it does:
- Opens the QC Wizard
- Runs automated diagnostics
- Walks you through manual tests
- Generates a certificate/report
- Attempts submission (if activated/online)

### Basic QC

Use when: you want the core automated checks only (faster), or when your process separates manual tests.

What it does:
- Runs automated diagnostics
- Populates results in the UI
- May still generate partial outputs depending on build/workflow settings

Recommended: For certification workflows, prefer **Full QC** so manual checks are captured.

### Junk Cleanup

Use when: you want to remove common temporary/junk files before delivery or retest.

What it does:
- Runs cleanup routines (safe deletion of temporary files)

Note: Cleanup is a utility action; it does not replace QC.

### Manual “Test” buttons

Use when: you need to run or re-run a specific manual test without doing a full wizard.

Examples:
- Keyboard test
- Trackpad test
- USB test
- A/V test
- Network test

---

## Outputs you should expect

After a successful QC flow, you should have:

- A **local report/certificate file** saved on disk (openable via “View Report”)
- A clear **overall result** (grade/score or pass/fail)
- If activated and online: a **submission success** message and a QR/Health ID for verification

If any of these are missing, capture screenshots/logs and inform your QC lead.

