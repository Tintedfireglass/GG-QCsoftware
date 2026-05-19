# Pramaan — Documentation Index

> **Gadget Guruz Pramaan QC Platform** · Private & Confidential

---

## Overview

Pramaan is a full-stack quality-control (QC) certification platform for refurbished laptops and enterprise IT fleets. It consists of three integrated components:

| Component | Technology | Purpose |
|---|---|---|
| **Pramaan CLI** | C# / .NET 8 (Linux) | Run hardware diagnostics & stress tests on any Linux machine |
| **Pramaan Core + Windows App** | C# / .NET 8 / WPF | Windows desktop QC tool with full UI |
| **Pramaan Dashboard** | Next.js 16 / TypeScript / PostgreSQL | Web admin portal — manage results, users, licenses, fleet |

---

## Documentation Map

### For End Users

| Document | Audience | Description |
|---|---|---|
| [End-User Docs (Index)](./end-user/README.md) | QC Technicians, Operations, Admins | Feature docs for the Web Dashboard and the Windows (WPF) app |
| [API Guide (Integrations)](./end-user/api/README.md) | Integrations, IT, Developers | Practical API usage guide + Postman collection pointers |

### For the Business Team

| Document | Audience | Description |
|---|---|---|
| [Product Overview](./business/product-overview.md) | All stakeholders | What Pramaan does, the problem it solves, and the value it delivers |
| [User Roles & Access Control](./business/user-roles.md) | Admins, Sales, Onboarding | Who can access what — detailed role matrix |
| [Grading & Certification System](./business/grading-system.md) | Operations, QC Managers | How devices are scored, graded A+→Reject, and certified |
| [License & Trial Management](./business/licensing.md) | Sales, Finance | License key types, free trials, credit system |
| [Workflow: Device Certification](./business/certification-workflow.md) | QC Technicians, Managers | Step-by-step end-to-end certification process |

### For the Engineering Team

| Document | Audience | Description |
|---|---|---|
| [Architecture Overview](./engineering/architecture.md) | All engineers | System architecture, component relationships, data flow |
| [CLI Reference](./engineering/cli-reference.md) | DevOps, Infra engineers | Complete Pramaan CLI command reference |
| [Diagnostics Engine](./engineering/diagnostics-engine.md) | Backend engineers | How hardware diagnostics and stress tests work |
| [Scoring Engine](./engineering/scoring-engine.md) | Backend engineers | PramaanScoringEngine — weights, categories, algorithm |
| [Web API Reference](./engineering/api-reference.md) | Backend & frontend engineers | All REST API endpoints |
| [Database Schema](./engineering/database-schema.md) | Backend engineers | Full database schema with table descriptions |
| [Server Agent (Linux)](./engineering/server-agent.md) | DevOps, Infra engineers | Headless server health monitoring agent |
| [Deployment Guide](./engineering/deployment.md) | DevOps | Web dashboard deployment, environment variables |
| [Engineering Q&A](./engineering/engineering-qa.md) | All engineers | Deep-dive answers to technical questions on telemetry, scoring, fingerprinting |

---

## Quick Start

### Running the CLI (Linux)

```bash
# Interactive dashboard
./pramaan

# Run full QC non-interactively
./pramaan --full-qc

# View help
./pramaan --help
```

### Running the Web Dashboard (Development)

```bash
cd web
npm install
# Copy .env.example → .env.local and fill in DATABASE_URL
npm run dev
```

### Building the Windows Desktop App

```bash
cd src
dotnet build
dotnet run --project LaptopQC.App
```

---

*Last updated: May 2026 · Gadget Guruz*
