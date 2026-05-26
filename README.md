# LaptopQC Tool - Monorepo

Quality Control tool for refurbished laptops with centralized admin dashboard.

## Project Structure

```
.
├── src/                    # C# Desktop Application
│   ├── LaptopQC.App/      # WPF Desktop UI
│   ├── LaptopQC.Core/     # Core business logic
│   └── LaptopQC.Hardware/ # Hardware detection
│
└── web/                    # Next.js Web Admin Dashboard
    ├── app/               # Next.js App Router
    │   └── api/          # Serverless API routes
    ├── lib/              # Utilities and database
    └── components/       # React components
```

## Components

### 1. Desktop Application (C# / WPF)
Located in `src/`

**Purpose**: Run QC tests on refurbished laptops
- CPU, RAM, Storage, Battery tests
- Keyboard, Trackpad, USB, Audio/Video tests
- GPU stress testing
- SMART health checks
- Generates HTML reports locally

**See**: `src/` for C# desktop application

### 2. Web Admin Dashboard (Next.js / TypeScript)
Located in `web/`

**Purpose**: Centralized management of all QC test results
- Collects test results from all desktop instances
- Displays analytics and trends
- Search and filter results
- Machine tracking and history

**See**: `web/README.md` for setup instructions

## Getting Started

### Desktop Application
```bash
# Build and run
cd src
dotnet build
dotnet run --project LaptopQC.App
```

### Whitelabel Builds (per customer)
The desktop app supports a per-customer build via the `Brand` MSBuild property.

```bat
REM Publish brand (outputs to publish\<Brand>\)
publish.bat Pramaan
publish.bat Cirtyn
```

For the installer, pass the matching brand to Inno Setup (and ensure `installer/brands/<Brand>.iss` exists):

```bat
REM Inno Setup (ISCC.exe)
ISCC.exe /DBrand=Cirtyn installer\installer.iss
```

### Web Dashboard
```bash
# Setup and run
cd web
npm install
# Configure .env.local with your database
npm run dev
```

## Workflow

1. **QC Technician** runs desktop app on laptop being tested
2. **Desktop App** performs all diagnostic tests
3. **Desktop App** generates local HTML report
4. **Desktop App** submits results to web API (automatic)
5. **Admin** views all results in web dashboard
6. **Admin** analyzes trends, filters by machine, exports data

## Tech Stack

- **Desktop**: C# 8, .NET 8, WPF, Avalonia UI
- **Web Backend**: Next.js 14 API Routes (Serverless Functions)
- **Web Frontend**: React, TypeScript, Tailwind CSS
- **Database**: PostgreSQL (Vercel/Supabase/Railway/Neon)
- **Deployment**: Vercel (web), Windows Installer (desktop)

## License

Private - Gadget Guruz 
