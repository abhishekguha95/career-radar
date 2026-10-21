# Career Radar

Local-first engineering job-search intelligence. Collect published jobs from Lever, preserve posting history in PostgreSQL, and browse them in a local dashboard with geography evidence and source status. No paid AI provider is required.

## Prerequisites

- Node.js 24 (local verification starts with 24.3.0; prefer a patched 24.x release).
- npm (included with Node). The npm commands bootstrap pinned pnpm 12.14.0 internally; no global pnpm installation is required.
- Docker Desktop running with Linux containers and Docker Compose.

## Local setup (PowerShell)

```powershell
if (-not (Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
npm run setup
npm run db:start
npm run db:migrate
npm run demo
```

Start the backend and frontend in separate terminals, both from the repository root:

```powershell
# Terminal 1: API at http://127.0.0.1:3001
npm run backend
```

```powershell
# Terminal 2: dashboard at http://127.0.0.1:3000
npm run frontend
```

The dashboard shows stored jobs, title/location/workplace/data-type/observation-date filters, pagination, posting details, geography evidence, version history and source health. Refresh reloads stored data; collecting jobs remains an explicit CLI command. Sample jobs are labeled **Sample data**; records fetched from Lever's demo site are labeled **Provider demo**.

`npm run demo` imports three fictional postings from [baseline.json](fixtures/lever/baseline.json), simulating two Lever response pages without a network request. Repeating it reports three unchanged postings without duplicates. It is optional when using real employer sources. Baseline observation dates are fixed; a narrow observation-date filter may hide these samples.

PostgreSQL binds only to 127.0.0.1:54329. Compose uses disposable local credentials from .env.example. Never reuse these credentials for a shared or deployed system. JavaScript runs on the host; API/worker containers and Redis are deferred. If you change PostgreSQL credentials/port, update DATABASE_URL and TEST_DATABASE_URL to match. Stop each server with Ctrl+C; `docker compose stop` preserves PostgreSQL data. Setup requires network access for packages and the container image; installed fixture replay and tests make no ATS/LLM requests.

The frontend reads the API on the server using a private loopback origin, defaulting to API_PORT or 3001. Set CAREER_RADAR_API_ORIGIN in .env if needed. No browser CORS configuration or public database URL is needed. The frontend dev port defaults to 3000 (override with the process PORT environment variable).

## Query the API (second PowerShell terminal)

```powershell
Invoke-RestMethod 'http://127.0.0.1:3001/health'
Invoke-RestMethod 'http://127.0.0.1:3001/ready'
$jobs = Invoke-RestMethod 'http://127.0.0.1:3001/jobs?mode=FIXTURE&limit=2&page=1'
$jobs.pagination
$jobs.data | Select-Object title, employer, lastSeenAt, eligibility
$jobId = $jobs.data[0].id
(Invoke-RestMethod "http://127.0.0.1:3001/jobs/$jobId").data.provenance
```

| Endpoint | Behavior |
| --- | --- |
| `GET /health` | Process liveness; works independently of database readiness. |
| `GET /ready` | Checks database access and required migration fields; returns 503 when unavailable. |
| `GET /jobs` | List summaries; strict filters and bounded pagination; no raw descriptions in list responses. |
| `GET /sources` | Source-wide posting/remote counts, health, latest run state and completeness; includes sources with no runs. |
| `GET /jobs/:id` | Full description, source/run metadata, geography evidence, latest fetch provenance, current raw source payload, and metadata for up to 20 preserved versions. |

List filters: `title`, `source` (source UUID), `location` (primary or additional locations), `observedSince` (ISO timestamp with timezone), `workplace=REMOTE|HYBRID|ON_SITE|UNKNOWN`, and `mode=FIXTURE|LIVE`. Pagination: `page` defaults to 1, `limit` to 20 (maximum 100). Filters combine with AND; title/location are literal case-insensitive substrings. Unknown or malformed parameters return 400.

Examples: `/jobs?title=Backend&workplace=REMOTE&mode=FIXTURE`, `/jobs?location=India`, `/jobs?observedSince=2026-10-20T00%3A00%3A00Z`. Freshness means last observed, not newly posted. Lists return `{data, pagination}`; details return `{data}`; errors return `{error:{code,message,requestId,details?}}`. Each request receives an `X-Request-Id` header.

Eligibility labels apply only to the `INDIA_REMOTE` geography signal. `Remote` or relocation support alone stays `UNKNOWN`. Even an `ELIGIBLE` geography signal requires separate checks for work authorization, sponsorship, and other application requirements.

## Fixture changes and partial failures

After the baseline replay, `npm run ingest -- --fixture fixtures/lever/changed.json` changes one posting while retaining its previous version. `npm run ingest -- --fixture fixtures/lever/partial.json` saves its first page and deliberately fails the second, returning PARTIAL with a nonzero exit code. Missing postings stay open in either case. Replaying an older, different version after newer observations is rejected rather than replacing current content.

`npm run ingest -- --help` describes all arguments (build the ingestion workspace first with `npm run build` or `npm run demo`). The underlying CLI exit codes are 0 succeeded, 2 partial, 1 failed/input error, and 130 interrupted. pnpm can translate a child failure into exit 1; use `node apps/ingest/dist/main.js ...` when automation needs the exact CLI code. Fixture and live sources are isolated by mode.

## Live collection

```powershell
# Bounded example using Lever's documented demo site:
npm run ingest -- --site leverdemo --employer "Lever Demo" --region global --max-pages 1 --page-size 10
```

This deliberately bounded example reports PARTIAL if the page is full; committed records remain available. For your search, replace the demo site/employer with the employer's actual public Lever site identifier and display name. Use `--region eu` for a European instance. There is no automatic employer discovery yet.

Requests are GET-only with fixed provider hosts, 250 ms pacing, a 10-second timeout per attempt, an 8 MiB response limit, at most three attempts, and at most 100 pages. Long Retry-After values stop collection instead of retrying early. This connector covers configured employers using Lever; target-employer coverage has not yet been benchmarked against Greenhouse. No application submission endpoint is implemented.

## Checks

```powershell
npm run build
npm run typecheck
npm run lint
npm test
$testDbExists = docker compose exec -T postgres psql -U career_radar -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='career_radar_test'"
if ($testDbExists -ne '1') { docker compose exec -T postgres createdb -U career_radar career_radar_test }
npm run test:integration
npm run test:ui
```

TEST_DATABASE_URL must name a dedicated database ending in `_test`. Tests create and remove only random schemas within that database. The defaults use `career_radar_test`, separate from the working database. Unit tests cover mapping, fetch bounds, offline fixtures, ambiguous geography and UI query parsing. Integration tests exercise real migrations, concurrent idempotency, history, rollback, partial/failed crawls, and API contracts. UI tests require installed Google Chrome, start isolated servers on 3100/3101, and exercise desktop/mobile flows against a generated test schema. Screenshots and traces are ignored under test-results. [Verification evidence](docs/VERIFICATION.md) records exact results and a fresh-source setup check.

## Current limits

- No ranking, candidate profiles, embeddings, LLMs, resume generation, email, applications, deployment, or additional ATS connectors.
- Geography rules recognize a small whitelist of explicit statements. Most real descriptions can remain UNKNOWN; no real-job precision/recall benchmark is claimed.
- No fuzzy cross-source merging or automatic closure. A posting last observed as PUBLISHED can become stale; inspect lastSeenAt and source/run health.
- Offset pagination is internally consistent per response; separate pages can shift during ingestion.
- Abrupt termination can leave a RUNNING run until the next run for that source marks it ABORTED. Unfinalized counters can underreport committed records.
- History is append-only through the repository, with no claim of protection from local database administrators. The detail endpoint caps history metadata at 20 versions; older versions remain in PostgreSQL.
- The API binds only to loopback and has no authentication. Shared hosting requires a separate security review.

## Project map

- `apps/api`: NestJS HTTP entry point.
- `apps/web`: Next.js dashboard; server-side API reads and URL-based browsing state.
- `apps/ingest`: fixture/live CLI entry point.
- `packages/contracts`: shared domain and boundary contracts.
- `packages/core`: adapter, normalization, geography assessment and ingestion coordination.
- `packages/database`: SQL repositories and migrations.
- `fixtures/lever`: fictional, network-independent source data.
- `docs`: [system design walkthrough](docs/SYSTEM_DESIGN.md), [architecture](docs/ARCHITECTURE.md), [decisions](docs/DECISIONS.md), [roadmap](docs/ROADMAP.md), [research](docs/OPEN_SOURCE_RESEARCH.md), [verification](docs/VERIFICATION.md).

See verification and roadmap for completion evidence and the next review. The [Phase 3 handover](docs/PHASE_3_HANDOVER.md) covers real-employer coverage, profile requirements, evaluation and ranking proposals for the next implementation session. Original code is MIT licensed; research inputs are not imported dependencies. Implementation subtasks have incremental Git commits. No branch has been pushed or deployed.
