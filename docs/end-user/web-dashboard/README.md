# Web Dashboard (End-User Guide)

The Pramaan Web Dashboard is where you **review and manage QC outcomes** after devices have been tested (usually from the Windows desktop app). It provides:

- A searchable list of QC runs (results) across teams and customers
- Per-machine history (multiple QC runs over time)
- Role-based user management
- License key management (activations)
- Printable certificates and exports

This guide focuses on what an end-user can do on the dashboard, not the backend architecture.

---

## Who uses it (typical)

- **Technicians**: locate a run, view details, print a certificate, export results for a batch.
- **QC Leads / Operations**: audit failures/issues, monitor volume, spot suspicious device changes, ensure reports are uploaded.
- **Resellers / Refurbishers / Enterprises / Clients**: review device health before resale/return; track device history; manage keys and users (as allowed).
- **Super Admin**: full access, including free-trial monitoring.

Because access is **role-based**, different users see different menu items and controls.

---

## Navigation (left sidebar)

You’ll see a left sidebar with the pages your role allows:

- **Overview** (`/dashboard`): snapshot of activity + latest QC results.
- **QC Results** (`/dashboard/results`): the main workhorse page; search, filter, export, print.
- **Machines** (`/dashboard/machines`): devices tracked over time; history and “latest report”.
- **User Management** (`/dashboard/users`): create/edit users (if your role permits).
- **Licenses** (`/dashboard/licenses`): generate and manage license keys (if your role permits).
- **Free Trials** (`/dashboard/free-trials`): SuperAdmin-only audit log of trial activations.

If you don’t see a page, it is usually because your role does not have permission.

---

## Common workflows (step-by-step)

### 1) Find a specific QC run

1. Go to **QC Results**.
2. Search using any identifying text you have:
   - Test ID (e.g., `#1234`)
   - System serial number
   - Model/manufacturer
   - Technician name (if shown)
3. Click **VIEW** on the matching row to open details.

If you’re not finding it:
- Confirm the desktop app actually **submitted** the run (not “saved locally only”).
- Try searching by fewer keywords (e.g., last 4 of the serial or model only).

### 2) Print a certificate (A4)

1. From **QC Results**, click the printer icon on the row.
2. This opens the print-friendly certificate page (`/report/{id}`) in a new tab.
3. Use the browser print dialog to print or “Save as PDF”.

Tip: If the print dialog does not open automatically, use your browser print shortcut.

### 3) Export results for a batch (XLSX / PDF)

1. Go to **QC Results**.
2. Apply filters (client/user, grade, issues-only) and sort order if needed.
3. Click **Export XLSX** or **Export PDF**.

Best practice: Always apply filters first—exports typically reflect the current filter set.

### 4) Track a device over time

1. Go to **Machines**.
2. Search for the device by serial, custom name, computer name, or machine id.
3. Click **View History**.
4. Review the timeline of runs and any detected hardware changes between runs.

This is especially useful for:
- Warranty/returns validation
- Detecting component swaps (RAM/storage/battery/board) between QC runs
- Fleet tracking (enterprise scenarios)

### 5) Verify a certificate publicly (QR / health id)

If you have a **Health ID** or QR code from a certificate:
- Open `/verify/{healthId}` in a browser.

If verification fails:
- Confirm the run was submitted successfully.
- Confirm the Health ID is correct (no missing characters).

---

## What’s next

For a detailed “what each page does, what filters mean, and what fields you’ll see”, read:

- [Web Dashboard Pages & Features](./pages.md)

