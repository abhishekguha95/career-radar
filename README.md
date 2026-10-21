# Career Radar

Local-first engineering job-search intelligence. Phase 1 is being implemented: collecting published jobs from Lever, preserved posting history, PostgreSQL storage, a conservative India-remote geography signal, and a read-only API. No paid AI provider is required.

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
pnpm db:migrate
pnpm ingest --fixture fixtures/lever/baseline.json
pnpm ingest --fixture fixtures/lever/baseline.json
```

The first fixture run creates three fictional postings; the second reports three unchanged postings and no duplicates. PostgreSQL binds only to 127.0.0.1:54329. Compose uses disposable local credentials from .env.example. Never reuse these credentials for a shared or deployed system. JavaScript runs on the host; API/worker containers and Redis are deferred.

## Fixture changes and partial failures

After the baseline replay, `pnpm ingest --fixture fixtures/lever/changed.json` changes one posting while retaining its previous version. `pnpm ingest --fixture fixtures/lever/partial.json` saves its first page and deliberately fails the second, returning PARTIAL with a nonzero exit code. Missing postings stay open in either case. Replaying an older, different version after newer observations is rejected rather than replacing current content.

`pnpm ingest --help` describes all arguments. The underlying CLI exit codes are 0 succeeded, 2 partial, 1 failed/input error, and 130 interrupted. Fixture and live sources are isolated by mode.

## Live collection

```powershell
pnpm ingest --site <actual-lever-site> --employer "Employer display name" --region global --max-pages 10
```

Use the employer's actual public Lever site identifier, not a URL. For a European Lever instance, use `--region eu`. Requests are GET-only with fixed provider hosts, 250 ms pacing, bounded timeout/payload/page limits, and at most three attempts. Long Retry-After values stop collection instead of retrying early. This first connector covers configured employers using Lever; target-employer coverage has not yet been benchmarked against Greenhouse.

## Checks

```powershell
pnpm build
pnpm typecheck
pnpm lint
pnpm test
docker compose exec -T postgres createdb -U career_radar career_radar_test
pnpm test:integration
```

Create the test database only once; if it already exists, keep it. TEST_DATABASE_URL must name a dedicated database ending in `_test`. Tests create and remove only random schemas within that database. The API commands will be documented after their increment is verified.

## Project map

- `apps/api`: NestJS HTTP entry point (planned).
- `apps/ingest`: fixture/live CLI entry point.
- `packages/contracts`: shared domain and boundary contracts.
- `packages/core`: adapter, normalization and ingestion; eligibility follows next.
- `packages/database`: SQL repositories and migrations.
- `fixtures/lever`: fictional, network-independent source data.
- `docs`: [architecture](docs/ARCHITECTURE.md), [decisions](docs/DECISIONS.md), [roadmap](docs/ROADMAP.md), [research](docs/OPEN_SOURCE_RESEARCH.md), [verification](docs/VERIFICATION.md).

Current state: Phase 1 increments 1-4. See the roadmap for the next step and exclusions. Original code is MIT licensed; research inputs are not imported dependencies.
