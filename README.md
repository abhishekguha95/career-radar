# Career Radar

Local-first engineering job-search intelligence. Phase 1 is being implemented: Lever ingestion, immutable change evidence, PostgreSQL storage, a conservative India-remote geography signal, and a read-only API. No paid AI provider is required.

## Prerequisites

- Node.js 24 (local verification starts with 24.3.0; prefer a patched 24.x release).
- pnpm 12.14.0. If absent: `npm exec --yes --package=pnpm@12.14.0 -- pnpm --version`. Use the same prefix for subsequent pnpm commands until installed normally.
- Docker Desktop running with Linux containers and Docker Compose.

## Local setup (PowerShell)

```powershell
Copy-Item .env.example .env
npm exec --yes --package=pnpm@12.14.0 -- pnpm install --frozen-lockfile
docker compose up -d --wait
pnpm build
```

The remaining migration, fixture, live-ingestion and API commands will be documented as their increments are verified. PostgreSQL binds only to 127.0.0.1:54329. Compose uses disposable local credentials from .env.example. Never reuse these credentials for a shared or deployed system.

## Project map

- `apps/api`: NestJS HTTP entry point (planned).
- `apps/ingest`: fixture/live CLI entry point (planned).
- `packages/contracts`: shared domain and boundary contracts.
- `packages/core`: adapter, normalization, eligibility and ingestion (planned).
- `packages/database`: SQL repositories and migrations (planned).
- `fixtures/lever`: fictional, network-independent source data (planned).
- `docs`: [architecture](docs/ARCHITECTURE.md), [decisions](docs/DECISIONS.md), [roadmap](docs/ROADMAP.md), [research](docs/OPEN_SOURCE_RESEARCH.md), [verification](docs/VERIFICATION.md).

Current state: Phase 1 increment 1. See the roadmap for the next step and exclusions. Original code is MIT licensed; research inputs are not imported dependencies.
