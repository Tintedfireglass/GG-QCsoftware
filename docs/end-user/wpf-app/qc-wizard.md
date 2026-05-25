# QC Wizard (End-to-End Flow)

The QC Wizard is the recommended workflow for certifying a device because it produces:

- A consistent technician flow (less missed checks)
- A local certificate/report file for the device
- A server-submitted result (when activated and online), visible in the Web Dashboard
- A QR/Health ID for public verification (when submission succeeds)

The wizard guides you through:
1) Preparation → 2) Automated checks → 3) Interactive/manual checks → 4) Report + submission

---

## Before you start (prep checklist)

Recommended items:
- Power adapter plugged in (avoid throttling or sudden shutdown)
- Stable internet (if you plan to submit results)
- A known-good USB device for the USB test
- Headphones (for jack detection/audio test)
- Quiet environment (for mic playback)

Optional but helpful:
- Device asset tag / internal refurbish id ready
- Any known issues noted (to include in technician notes)

---

## Step 1 — Preparation

You will be asked for:

- **Refurbish ID / Asset Tag** (required)  
  This is the internal identifier your team uses for the physical device. Use a consistent format (e.g., `GG-DEL-2026-00123`).

- **Technician notes** (optional)  
  Free text that can appear on the report/certificate. Use this for:
  - Cosmetic notes (“minor scratches on lid”)
  - Customer-specific instructions (“battery replaced, new SSD installed”)
  - Anything that should travel with the certificate

Then click **Start Tests**.

What happens next:
- The app starts a new QC session tied to the Refurbish ID.
- You move into automated checks.

Common mistakes:
- Leaving Refurbish ID blank (wizard will block start).
- Using inconsistent asset tag formats (makes later search/audit harder).

---

## Step 2 — Automated checks

The app runs automated diagnostics and shows:

- **Progress** (percentage)
- **Status messages** describing what is currently running

What to do:
- Do not interrupt the machine during this phase.
- If the machine becomes very slow, let the test finish; some checks are intentionally heavy.

If an error occurs:
- Note the error message.
- Retry once if the error looks transient (e.g., a service not ready).
- If repeated, continue with manual checks (if possible) and report the issue to your lead.

---

## Step 3 — Interactive/manual checks

After automated checks complete, the wizard guides you through manual checks in order:

1) **Keyboard test**
2) **Trackpad test**
3) **USB port test**
4) **Audio & video test** (speakers, mic, headphones, camera)
5) **Network connectivity test** (WiFi/Ethernet/Internet)

Each step opens a dedicated window and asks you to confirm **Pass** or **Fail** based on what you observe.

General best practices:
- If something fails, do the quick sanity checks first (volume, mute, drivers, airplane mode, etc.).
- If a failure is confirmed, mark Fail accurately—don’t “pass” to move faster; the certificate credibility depends on this.
- Use technician notes to record what you observed (e.g., “right speaker crackling at high volume”).

Detailed instructions for each manual test are in:
- [Manual Test Windows](./manual-tests.md)

---

## Step 4 — Report + submission

When the wizard reaches completion, the app generates the report and attempts submission (if configured).

### Report generation (local)

What you get:
- A locally saved **QC certificate/report** file
- A displayed file path so you can locate it later

Use **View Report** to open it immediately.

### Submission (cloud / dashboard visibility)

Submission depends on two things:
1) The app is **activated/logged in** (license key or trial).
2) The machine can reach the server (network + server available).

You will see a status message such as:
- **Submitted**: the result is uploaded and should appear in the Web Dashboard.
- **Saved locally only**: you are offline or you chose “work offline” during activation.
- **Activation required**: submission is blocked until activated.

If submission succeeds:
- The wizard shows a **QR code**.
- The QR code points to a public verification URL (`/verify/{healthId}`).

If submission fails:
- Keep the local report (it still matters).
- Re-check login/activation and internet, then rerun submission if your build supports it (or rerun QC if required by your process).

