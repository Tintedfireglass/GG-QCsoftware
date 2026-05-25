# Deployment Guide

> **Audience:** DevOps, Infra engineers  
> **Classification:** Internal

---

## Web Dashboard Deployment

### Prerequisites
- Node.js 20+
- A PostgreSQL 14+ database
- A hosting platform (Vercel recommended; DigitalOcean App Platform, Railway, or any Node.js host supported)

---

### Environment Variables

Create a `.env.local` file in the `web/` directory (or set in your hosting platform's environment settings):

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret key for signing JWT tokens (use a long random string) |
| `NEXT_PUBLIC_API_URL` | — | Override public API base URL (optional; defaults to `/api`) |

**Connection string format:**
```
postgresql://username:password@host:5432/database_name?sslmode=require
```

> **Note:** The `db.ts` client strips `sslmode` from the connection string and controls SSL explicitly (`rejectUnauthorized: false`). Do not add `sslmode` to the connection string if using hosted PostgreSQL services like Neon or Supabase.

---

### Database Setup

1. **Initial schema:**
```bash
psql $DATABASE_URL -f web/lib/init-db.sql
```

2. **Apply all migrations in order:**
```bash
for f in web/migrations/*.sql; do
  echo "Applying $f..."
  psql $DATABASE_URL -f "$f"
done
```

3. **Change the default admin password** (the default is `admin123`):
```sql
UPDATE users
SET password_hash = '<new bcrypt hash>'
WHERE username = 'admin';
```

---

### Deploying to Vercel (Recommended)

1. Push the `web/` directory (or the full monorepo) to GitHub
2. Import the project on [vercel.com](https://vercel.com)
3. Set the root directory to `web/`
4. Add environment variables: `DATABASE_URL`, `JWT_SECRET`
5. Deploy — Vercel handles build + CDN automatically

**Build command:** `npm run build`  
**Output directory:** `.next` (Next.js standard)

---

### Deploying to DigitalOcean App Platform

1. Create a new App in DigitalOcean App Platform
2. Point it to the `web/` directory
3. Set environment variables: `DATABASE_URL`, `JWT_SECRET`
4. Set the run command: `npm start`
5. Set the build command: `npm run build`

> **Important:** DigitalOcean does not resolve `${VAR}` placeholders in environment variables. Set `DATABASE_URL` to the full literal connection string.

---

### Running Locally

```bash
cd web
npm install
cp .env.example .env.local  # Create if not exists
# Edit .env.local with your DATABASE_URL and JWT_SECRET
npm run dev
```

Access at: `http://localhost:3000`

---

## CLI Binary Distribution

### Building the Linux CLI

```bash
cd cli
dotnet publish -c Release -r linux-x64 --self-contained true \
  -p:PublishSingleFile=true -o ./publish
```

The output is a single `pramaan` binary (~30 MB) that includes the .NET runtime and all dependencies. No installation required on target machines.

**Bundle the `smartctl-linux-x64` binary** alongside `pramaan` — it is used for SMART diagnostics.

---

### Installing on a Target Machine

```bash
# Extract the archive (if distributed as .tar.gz)
tar -xzf pramaan-cli-linux-x64-standalone.tar.gz

# Make executable
chmod +x ./pramaan
chmod +x ./smartctl-linux-x64

# (Optional) Install to system path
sudo cp pramaan /usr/bin/pramaan
```

---

### Installing Background Services

```bash
# Must be run as root
sudo pramaan --install-background
```

This automatically:
1. Writes systemd service + timer unit files to `/etc/systemd/system/`
2. Runs `systemctl daemon-reload`
3. Enables and starts `pramaan-heartbeat.timer` (every 4 hours)
4. Enables and starts `pramaan-autoqc.timer` (weekly)

---

## Windows Desktop App — Build & Package

### Prerequisites
- Visual Studio 2022 or .NET 8 SDK on Windows
- Inno Setup 6 (for installer creation)

### Build

```cmd
cd src
dotnet publish LaptopQC.App -c Release -r win-x64 --self-contained true ^
  -p:PublishSingleFile=true -o ../publish/win-x64
```

### Create Installer

```cmd
cd ..
build_installer.bat
```

The `build_installer.bat` script calls Inno Setup with `installer/setup.iss` to produce a signed `.exe` installer.

### Publish Script

The `publish.bat` script in the root handles building both CLI and desktop app targets with appropriate publish profiles.

---

## Security Checklist

Before production deployment, verify:

- [ ] `JWT_SECRET` is a long (64+ character) random string — **not** the default or a simple password
- [ ] Default admin password (`admin123`) has been changed
- [ ] `DATABASE_URL` uses SSL (`sslmode=require` for supported drivers, or explicit SSL in db.ts)
- [ ] Vercel/hosting firewall restricts database access to app servers only
- [ ] HTTPS is enforced (Vercel does this automatically)
- [ ] No secrets are committed to the Git repository

---

## Health Check Endpoint

```
GET /api
```

Returns a basic status response. Useful for uptime monitoring:

```json
{ "status": "ok", "timestamp": "2026-05-18T14:00:00Z" }
```

---

## Logs & Monitoring

- **Next.js logs:** Available in Vercel dashboard or via hosting platform log stream
- **Database logs:** Available in your PostgreSQL provider's monitoring console
- **CLI logs:** The `--auto-basic-qc` and `--heartbeat` modes print to stdout/stderr (captured by systemd journal)

```bash
# View CLI background service logs
journalctl -u pramaan-heartbeat.service -n 50
journalctl -u pramaan-autoqc.service -n 50
```

---

*← Back to [Documentation Index](../README.md)*
