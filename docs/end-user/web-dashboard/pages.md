# Web Dashboard Pages & Features

This doc is a “feature reference” for end users: what pages exist, what they’re for, what you can do on each page, and how to interpret the key UI elements.

Some UI controls are **role-gated**. If you do not see a control described here, your role probably does not have permission.

---

## Login & entry

### Landing (`/`)

Purpose: initial entry route.

Expected behavior:
- If you are already authenticated, you are routed to the dashboard.
- If you are not authenticated, you are routed to login.

### Login (`/login`)

Purpose: authenticate to use the dashboard.

What to do:
- Enter credentials provided by your admin.
- If login fails, validate your username/password and check whether your account is active.

### Customer portal (`/customer/*`)

Purpose: customer-facing pages (if enabled in your deployment).

You may see:
- `/customer/login`: customer login
- `/customer/register`: create a customer account (if enabled)
- `/customer/account`: basic account details

If you’re not using customer self-service, these routes may be unused.

---

## Overview

### Overview (`/dashboard`)

Purpose: quick snapshot of activity and shortcuts to common actions.

What you typically see:
- **Recent QC tests** table (often limited to the latest N items)
- High-level counts (e.g., total tests, active machines)
- Alerts / issue summary (if configured)
- User stats (for admin roles)

What you can do:
- Use the search box to quickly narrow recent tests
- Open a test detail page using **VIEW**
- Jump to **QC Results** for full browsing

How to use it effectively:
- Treat Overview as a “now” page; for investigation work, go to **QC Results** or **Machines**.

---

## QC Results

### Results list (`/dashboard/results`)

Purpose: browse and investigate all QC runs.

When to use:
- You have a serial number/model/test id and want the exact report
- You want to export/print results for a batch
- You want to filter by client/user/grade/issues

Key controls and what they mean:

1) **Search**
- A free-text search across common result identifiers (serial, model, etc.).
- Best practice: start broad (model or partial serial), then refine.

2) **Client/User filter** (role-dependent)
- Lets you show results for a specific client/user.
- If you do not have permission to manage users, this filter may not appear.

3) **Grade filter**
- Limits results to selected grades (e.g., A+, A, B, C).
- If no grade is selected, the list usually behaves like “all grades”.

4) **Issues only**
- When enabled, limits results to runs flagged as having issues.
- Use this to focus QC review time on problem devices.

5) **Sort**
- Common sorts are “newest first”, grade high→low, etc.
- For audit work, “newest first” is usually best.

6) **Pagination**
- Results are split into pages. Use page controls for navigation.

Exports:
- **Export XLSX**: Excel download of the list using the current filters/sort.
- **Export PDF**: PDF download using the current filters/sort.

Row actions:
- **VIEW** → opens `/dashboard/results/{id}` with full details.
- **Printer icon** → opens `/report/{id}` (print-friendly certificate) in a new tab.

Troubleshooting:
- “No results found”: remove filters first, then search again.
- Export fails: retry after narrowing filters (large exports can take longer).

### Result detail (`/dashboard/results/{id}`)

Purpose: view one QC run with all details.

What you typically see:
- **Overall result**: pass/fail and/or grade and score
- **Device identity**: manufacturer/model/serial (and related system fields)
- **App version**: helps debug “why did this behavior differ?” across releases
- **Test breakdown**: each diagnostic component with pass/fail, score (if applicable), and notes/details
- **Technician notes** (if entered in the desktop app)

How to use it:
- Use this page to explain *why* a device got a grade (not just what it was).
- If the printed certificate is needed, use the printer action from the list page or open `/report/{id}` directly.

---

## Machines

### Machines list (`/dashboard/machines`)

Purpose: track devices as “machines” over time (one machine → many QC runs).

When to use:
- You care about the device lifecycle, not a single run
- You want to find the latest report for a device
- You want to spot machines that stopped checking in

Key controls and what they mean:

1) **Search**
- Searches across machine identity fields such as:
  - machine id
  - custom name
  - computer name
  - serial number
  - last IP
  - latest grade

2) **Grade filter**
- Shows only machines whose *latest grade* matches your selection.

3) **Sort**
- Grade sort: useful for triage (“show me the best/worst first”)
- Last-seen sort: useful for operations (“which devices are currently active?”)

4) **Active / Inactive**
- Status is derived from the last seen/check-in time.
- Use this to identify devices that have not reported in recently.

Per-machine actions:
- **View History**: opens machine history (`/dashboard/machines/{id}`)
- **Latest Report**: jumps to the most recent QC result for that machine (if available)

### Machine history (`/dashboard/machines/{id}`)

Purpose: device timeline and change detection between runs.

What you can do:
- Set a **Custom Name** (helps operators identify devices quickly)
- Review a timeline of QC runs for this machine
- Detect likely hardware changes between runs (where data is available)

Change detection (typical):
- **Storage**: drives added/removed (best for catching disk swaps)
- **RAM**: slot/capacity changes (best for catching upgrades/downgrades)
- **CPU**: summary change (rare; can hint at board swap)
- **Battery**: replacement indicators
- **System serial change warning**: can flag potential motherboard replacement

How to interpret “changed” signals:
- Treat it as a strong hint to investigate, not an automatic accusation.
- Common legitimate reasons: refurbishment upgrades, warranty service, authorized repairs.

---

## User Management (role-based)

### User list (`/dashboard/users`)

Purpose: manage accounts (role-based access control).

Common use cases:
- Add technicians for a team
- Deactivate a user who left
- Review who created which accounts

Key controls:
- Search by username/display name/email (where available)
- Filter by role
- Create user (button/link to `/dashboard/users/new`)
- Edit a user (open `/dashboard/users/{id}`)
- Deactivate/delete (SuperAdmin-only in typical setups)

### Create user (`/dashboard/users/new`)

Purpose: add a new account your role is allowed to create.

Key fields (typical):
- **Username**: the login handle
- **Password**: minimum length enforced
- **Email**: required
- **Display name**: optional, for nicer UI labeling
- **Company name**: required for certain organization roles (Enterprise/Reseller/Refurbisher/OEM/Insurer)
- **Role**: you can only assign roles that your own role permits

Best practices:
- Use a consistent naming convention for technicians (team + name).
- Always capture an email for account recovery and auditing.

### Edit user (`/dashboard/users/{id}`)

Purpose: update an account.

Common actions (role-dependent):
- Update display name/email
- Enable/disable user (active status)
- Change password (optional)
- Adjust license credits (where supported/allowed)

Safety notes:
- Deactivation prevents login immediately.
- Role changes are usually restricted to SuperAdmin.

---

## Licenses

### License keys (`/dashboard/licenses`)

Purpose: manage license keys used for activating devices and controlling allowed activations.

When to use:
- You need to generate keys for a new customer/team
- You want to audit whether a key is exhausted/expired
- You need to disable a key immediately

Key concepts:
- **Max uses**: the maximum number of device activations allowed by that key.
- **Current uses**: how many activations have been consumed.
- **Active vs revoked**: a revoked/disabled key stops working immediately.
- **Expired**: key has passed its expiry date (if applicable).

Key actions:
- **Generate new key**:
  - Select type (single-use / demo / multi-use depending on deployment)
  - Set max activations (for applicable key types)
  - Provide customer name when required (often for demo keys)
- **Copy**: copy the key to clipboard for sharing securely
- **Enable/disable**: disable when a key should no longer work

Operational best practices:
- Treat license keys like credentials. Share via secure channels only.
- Prefer issuing separate keys per customer/team to simplify auditing.

---

## Free Trials (SuperAdmin)

### Trial activations (`/dashboard/free-trials`)

Purpose: audit free trials started from the desktop app.

What you see:
- Email (trial owner)
- Machine identifiers (serial/MAC/computer name or machine id)
- Trial start and end timestamps
- Revocation status and reason (if revoked)

How to use:
- Investigate abuse (multiple attempts across devices/emails)
- Confirm a trial is active/expired when supporting a customer
- Refresh to fetch latest state

---

## Public verification & printable certificate

### Printable certificate (`/report/{id}`)

Purpose: A4 print-friendly certificate for a specific QC run.

What it includes (typical):
- Test ID and timestamp
- Overall grade/score or pass/fail
- Device identity fields (manufacturer/model/serial)
- Summary diagnostic results table
- Technician notes (if present)
- QR code/Health ID (when available)

### Public verification (`/verify/{healthId}`)

Purpose: public page that confirms a certificate is valid and shows summary details.

When you’d use it:
- A buyer/customer scans QR on the certificate to verify authenticity
- Support staff validates a Health ID quickly without dashboard access

