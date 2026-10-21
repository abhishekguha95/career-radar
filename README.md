# Career Radar

Local-first engineering job-search intelligence. Phase 1 collects published jobs from Lever, preserves posting history in PostgreSQL, provides a conservative India-remote geography signal, and exposes a read-only API. No paid AI provider is required.

## Prerequisites

- Node.js 24 (local verification starts with 24.3.0; prefer a patched 24.x release).
- pnpm 12.14.0. The setup below includes a session-local wrapper if pnpm is absent; no global installation is required.
- Docker Desktop running with Linux containers and Docker Compose.

## Local setup (PowerShell)

```powershell
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  function pnpm { & npm.cmd exec --yes --package=pnpm@12.14.0 -- pnpm @args }
}
if (-not (Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
pnpm install --frozen-lockfile
docker compose up -d --wait
pnpm build
pnpm db:migrate
pnpm ingest --fixture fixtures/lever/baseline.json
pnpm ingest --fixture fixtures/lever/baseline.json
pnpm start
```

The first fixture run creates three fictional postings; the second reports three unchanged postings and no duplicates. PostgreSQL binds only to 127.0.0.1:54329. Compose uses disposable local credentials from .env.example. Never reuse these credentials for a shared or deployed system. JavaScript runs on the host; API/worker containers and Redis are deferred.

Run commands from the repository root. The API defaults to 127.0.0.1:3001. If you change PostgreSQL credentials/port, update DATABASE_URL and TEST_DATABASE_URL to match. Stop the API with Ctrl+C; `docker compose stop` preserves PostgreSQL data. Setup requires network access for packages and the container image; installed fixture replay and the tests make no ATS/LLM requests.

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
| `GET /jobs/:id` | Full description, source/run metadata, geography evidence, latest fetch provenance, current raw source payload, and metadata for up to 20 preserved versions. |

List filters: `title`, `source` (source UUID), `location` (primary or additional locations), `observedSince` (ISO timestamp with timezone), `workplace=REMOTE|HYBRID|ON_SITE|UNKNOWN`, and `mode=FIXTURE|LIVE`. Pagination: `page` defaults to 1, `limit` to 20 (maximum 100). Filters combine with AND; title/location are literal case-insensitive substrings. Unknown or malformed parameters return 400.

Examples: `/jobs?title=Backend&workplace=REMOTE&mode=FIXTURE`, `/jobs?location=India`, `/jobs?observedSince=2026-10-20T00%3A00%3A00Z`. Freshness means last observed, not newly posted. Lists return `{data, pagination}`; details return `{data}`; errors return `{error:{code,message,requestId,details?}}`. Each request receives an `X-Request-Id` header.

Eligibility labels apply only to the `INDIA_REMOTE` geography signal. `Remote` or relocation support alone stays `UNKNOWN`. Even an `ELIGIBLE` geography signal requires separate checks for work authorization, sponsorship, and other application requirements.

## Fixture changes and partial failures

After the baseline replay, `pnpm ingest --fixture fixtures/lever/changed.json` changes one posting while retaining its previous version. `pnpm ingest --fixture fixtures/lever/partial.json` saves its first page and deliberately fails the second, returning PARTIAL with a nonzero exit code. Missing postings stay open in either case. Replaying an older, different version after newer observations is rejected rather than replacing current content.

`pnpm ingest --help` describes all arguments. The underlying CLI exit codes are 0 succeeded, 2 partial, 1 failed/input error, and 130 interrupted. pnpm can translate a child failure into exit 1; use `node apps/ingest/dist/main.js ...` when automation needs the exact CLI code. Fixture and live sources are isolated by mode.

## Live collection

```powershell
# Bounded example using Lever's documented demo site:
pnpm ingest --site leverdemo --employer "Lever Demo" --region global --max-pages 1 --page-size 10
```

This deliberately bounded example reports PARTIAL if the page is full; committed records remain available. For your search, replace the demo site/employer with the employer's actual public Lever site identifier and display name. Use `--region eu` for a European instance. There is no automatic employer discovery yet.

Requests are GET-only with fixed provider hosts, 250 ms pacing, a 10-second timeout per attempt, an 8 MiB response limit, at most three attempts, and at most 100 pages. Long Retry-After values stop collection instead of retrying early. This connector covers configured employers using Lever; target-employer coverage has not yet been benchmarked against Greenhouse. No application submission endpoint is implemented.

## Checks

```powershell
pnpm build
pnpm typecheck
pnpm lint
pnpm test
$testDbExists = docker compose exec -T postgres psql -U career_radar -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='career_radar_test'"
if ($testDbExists -ne '1') { docker compose exec -T postgres createdb -U career_radar career_radar_test }
pnpm test:integration
```

TEST_DATABASE_URL must name a dedicated database ending in `_test`. Tests create and remove only random schemas within that database. The defaults use `career_radar_test`, separate from the working database. Unit tests cover mapping, fetch bounds, offline fixtures and ambiguous geography. Integration tests exercise real migrations, concurrent idempotency, history, rollback, partial/failed crawls, and API contracts. [Verification evidence](docs/VERIFICATION.md) records exact results and a fresh-source setup check.

## Limits of Phase 1

- No UI, ranking, candidate profiles, embeddings, LLMs, resume generation, email, applications, deployment, or additional ATS connectors.
- Geography rules recognize a small whitelist of explicit statements. Most real descriptions can remain UNKNOWN; no real-job precision/recall benchmark is claimed.
- No fuzzy cross-source merging or automatic closure. A posting last observed as PUBLISHED can become stale; inspect lastSeenAt and source/run health.
- Offset pagination is internally consistent per response; separate pages can shift during ingestion.
- Abrupt termination can leave a RUNNING run until the next run for that source marks it ABORTED. Unfinalized counters can underreport committed records.
- History is append-only through the repository, with no claim of protection from local database administrators. The detail endpoint caps history metadata at 20 versions; older versions remain in PostgreSQL.
- The API binds only to loopback and has no authentication. Shared hosting requires a separate security review.

## Project map

- `apps/api`: NestJS HTTP entry point.
- `apps/ingest`: fixture/live CLI entry point.
- `packages/contracts`: shared domain and boundary contracts.
- `packages/core`: adapter, normalization, geography assessment and ingestion coordination.
- `packages/database`: SQL repositories and migrations.
- `fixtures/lever`: fictional, network-independent source data.
- `docs`: [system design walkthrough](docs/SYSTEM_DESIGN.md), [architecture](docs/ARCHITECTURE.md), [decisions](docs/DECISIONS.md), [roadmap](docs/ROADMAP.md), [research](docs/OPEN_SOURCE_RESEARCH.md), [verification](docs/VERIFICATION.md).

Current state: Phase 1 implemented; see verification and roadmap for completion evidence and the next review. Original code is MIT licensed; research inputs are not imported dependencies. Every implementation subtask has an incremental Git commit. No branch has been pushed or deployed.
