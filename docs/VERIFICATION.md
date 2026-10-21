# Verification evidence

Phases 1–2 verified on 2026-10-21. Evidence below records checks actually run, including initial failures and their fixes. Increment counts describe the suite at that point; current totals are 59 unit tests, 43 PostgreSQL integration tests, and 8 browser tests.

2026-10-21 environment checks: Node 24.3.0, npm 11.18.0, Docker 29.8.1, Compose 5.5.1. Docker daemon responds outside the sandbox. pnpm was absent initially; Python resolves to an unusable Windows alias; no host psql is installed. npm metadata/peer ranges were checked outside the network sandbox.

The original kickoff is user-provided and was untracked at the start. No existing application code or dependencies were present. Git uses a command-scoped safe.directory exception in the sandbox; global Git config was not changed.

## Increment 1: foundation

- `npm exec --yes --package=pnpm@12.14.0 -- pnpm install`: passed; pinned lockfile generated.
- Same pnpm prefix with `build`, `typecheck`, and `lint`: passed for the contracts workspace and foundation configuration. No application/unit tests exist yet.
- `docker compose config --quiet`: passed.
- `docker compose up -d --wait`: pulled postgres:18.6-alpine and reached healthy state.
- `docker compose exec -T postgres psql -U career_radar -d career_radar -c 'SELECT version();'`: PostgreSQL 18.6 returned.
- `git diff --check`: passed for tracked changes; new files reviewed before staging.
- Sandbox npm networking and Docker named-pipe access require escalation in this environment. These are execution-environment limits, not application failures.

## Increment 2: adapter and fixtures

Using the pinned pnpm prefix: `build`, `typecheck`, `lint`, and `test` passed. Unit suite: **23 tests in 1 file**. Covers fixture replay without network, full description assembly, null/unknown fields, safe URL schemes, epoch/UTC handling, malformed records/envelopes, regional hosts/pagination, rate-limit pacing and retry limits, payload byte limits, and timeout aborts.

The initial TypeScript 6 build required an explicit `types: ["node"]` configuration; corrected and all checks rerun. Fictional fixture pages and source observations are deterministic. Persistence verification follows in increment 3.

## Increment 3: PostgreSQL persistence

`build`, `typecheck`, and `lint` passed. `test:integration`: **10 tests in 1 file**, against PostgreSQL 18.6. Every suite creates a random schema in a dedicated database whose name must end in `_test`; teardown drops only that generated schema.

Verified empty-schema migration and no-op replay; fixture/live source isolation; source locks; concurrent idempotency with no orphan opportunities; A -> B -> A change history; freshness without extra snapshots; sorted-JSON hashing; old-content rejection; transaction rollback; mismatched source/run rejection; abandoned-run recovery.

`db:migrate`: applied the initial migration to the local development database. Integration tests use a separate `career_radar_test` database. No pre-existing development data was removed.

## Increment 4: orchestration and CLI

`build`, `typecheck`, `lint` passed. PostgreSQL integration suite: **19 tests in 2 files**. Unit suite: **24 tests in 1 file**, including caller cancellation without retries.

Additional integration checks cover baseline replay, complete smaller crawl without closure, later-page failure retaining successful changes, total fetch failure, malformed first duplicate followed by valid records, page caps, bounded error samples, cancellation/lock release, and overlapping ingestion runs.

Actual `pnpm db:migrate` applied the second migration for latest-observation provenance. Actual `pnpm ingest --fixture fixtures/lever/baseline.json` ran twice: first SUCCEEDED with fetched/accepted/created=3; second SUCCEEDED with unchanged=3 and created=0. Fixture data resides only in the local development database. Changed/partial fixtures were tested in isolated integration schemas.

## Increment 5a: narrow geography signal

`build`, `typecheck`, and `lint` passed. Unit suite: **51 tests in 2 files**; PostgreSQL suite: **19 tests in 2 files**. Confirmed one ELIGIBLE, one INELIGIBLE, and one UNKNOWN assessment from the baseline fixture, without duplicate assessments on replay. Unit cases cover negation, questions, unsupported/conditional wording, sponsorship ambiguity, contradictory statements/metadata, contextual qualifiers, and exact evidence offsets.

The first integration run found that HTML list bullets prevented an otherwise explicit permission statement from matching. Corrected bullet handling, added an offset-preserving regression test, and reran both suites successfully. These are deterministic rule tests, not a measured real-job precision/recall benchmark.

## Increment 5b: read-only API

`build`, `typecheck`, `lint` passed. PostgreSQL integration suite: **42 tests in 3 files**, including 23 API contract cases. Covers process/readiness separation, stable-data pagination, source/title/location/freshness/workplace/mode and combined filtering, additional-location search, literal SQL wildcard handling, invalid/repeated/unknown query parameters, invalid/missing IDs, request-correlated error envelopes, sanitized database failures, safe JSON headers, evidence/provenance, and preserved history.

## Increment 6: fresh-source acceptance and live check

Archived Git revision `a080134` to a new temporary directory, with no node_modules, built output, or environment file. Created a new generated PostgreSQL database ending in `_test` and supplied its URLs only to the verification process.

| Command/check | Observed result |
| --- | --- |
| `npm exec --yes --package=pnpm@12.14.0 -- pnpm install --frozen-lockfile` | Passed; 293 packages installed. Registry speed warnings did not prevent installation. |
| Same pnpm prefix with `build` | All five package/application workspaces compiled from scratch. |
| Same prefix with `db:migrate` | Both migrations applied to the empty database. |
| Same prefix with `typecheck` and `lint` | Passed. |
| Same prefix with `test` | 51 tests passed in 2 files. |
| Same prefix with `test:integration` | 42 tests passed in 3 files against PostgreSQL 18.6. |
| `node apps/ingest/dist/main.js --fixture fixtures/lever/baseline.json`, twice | First: SUCCEEDED, created=3. Second: SUCCEEDED, created=0, unchanged=3. |
| Temporary database cleanup | Generated smoke database dropped; no databases with that generated smoke prefix remained. |
| Compiled API: `/health`, `/ready`, `/jobs?mode=FIXTURE&limit=2`, and job detail | HTTP 200; three fixture jobs total, bounded pagination, geography labels, current raw payload, mapping version and history returned. |
| Live CLI: `--site leverdemo --employer "Lever Demo" --max-pages 1 --page-size 10` | 10 fetched, accepted and created; zero malformed records. PARTIAL/incomplete with PAGE_LIMIT, deliberately triggered by the one-full-page bound. |
| `.env` ignore and Compose status | `.env` ignored; only PostgreSQL running in Compose, healthy on loopback. |
| No-global-install README helper and `ingest --help` | A PowerShell npm.ps1 forwarding issue was found; using npm.cmd passed version/help checks. |

The compiled API process was stopped after verification; start it with `pnpm start`. PostgreSQL remains running. The working database contains three fictional fixture postings plus ten public Lever demo postings, distinguishable by source mode. No live source payload is committed to Git.

The child CLI returns 2 for PARTIAL; nested pnpm script runners translated that to exit 1 during the live check. This behavior is documented; use the direct Node entry point for precise automation exit codes.

## Phase 2 increment 1: UI read boundary

Phase 2 UI scope is approved in revised ROADMAP.md. Added shared runtime response contracts and GET /sources with database-wide posting/remote counts, health, and latest run metadata, including sources with no runs. `build`, `typecheck`, `lint`, and **43 PostgreSQL integration tests** passed. Contract checks validate the actual API payloads used by the frontend and reject unsafe link schemes.

The in-app browser tool could not initialize (`sandbox-state-meta: missing field sandboxPolicy`), before any tab interaction. Local Chrome is installed; browser verification will use standalone Playwright as the documented fallback. No Site was registered or published.

## Phase 2 increment 2: dashboard and startup commands

- `npm run setup`: passed with the committed frozen lockfile and pinned pnpm bootstrap; no global pnpm required.
- `npm run build`: all six workspaces compiled, including a Next.js production build. Dynamic dashboard/sources and static guide routes generated successfully.
- `npm run typecheck` and `npm run lint`: passed, including frontend and browser-test code.
- `npm test`: **59 tests in 3 files passed**; frontend URL parsing, malformed/repeated filters and encoded links added to the existing domain checks.
- `npm run test:integration`: **43 tests in 3 files passed** against PostgreSQL 18.6.
- `npm run test:ui`: **8 tests passed** in installed Google Chrome, covering desktop 1440×1100 and a Pixel 7 mobile viewport. Verified browsing/sample labels, title search, clearing filters, pagination, selected-posting evidence/history, safe external links, empty/invalid states and partial/unrun sources. Checked document width for overflow and captured/visually reviewed both dashboard sizes. No uncaught page errors in the dashboard checks.
- The UI runner creates a random schema in the dedicated `_test` database, applies migrations and fictional fixtures, starts the actual `npm run backend`/`npm run frontend` commands on 3101/3100, and removes the schema afterward. Development data remains separate.
- `npm run db:start`: PostgreSQL healthy. `npm run db:migrate`: zero pending migrations. `npm run demo`: SUCCEEDED, created=0, unchanged=3, rejected=0 in the existing development database.
- A separate production-server Chrome smoke check used an unavailable API origin: dashboard and sources displayed the recovery screen and startup commands; the guide still worked; no uncaught page errors. Temporary server stopped afterward.

Initial build found a malformed option tag, fixed before verification. The first dependency install rejected lucide-react 1.61.0 under the 24-hour release-age policy; pinned compatible 1.60.0 instead. The first browser pass exposed a test race clicking a tab before selected-job navigation completed; the test now waits for the selected heading and selected tab. The complete rerun passed. Screenshots prompted larger, darker supporting text before that rerun. An initial offline-smoke locator matched Next.js's route announcer as well as the app alert; scoped the assertion to the recovery command and reran successfully. These were corrected verification failures; no retries are configured in the browser suite.

Browser screenshots/traces and the one-off offline smoke script remain ignored local artifacts. No remote registration, hosting or deployment occurred. Browser checks ran against the development server; the separate offline check exercised the production server. A clean-source installation was verified in Phase 1; Phase 2's frozen install/build ran in the current checkout, not a new archive. No performance or full accessibility audit is claimed.

Final cleanup check: no listeners remained on 3000, 3001, 3100, 3101 or 3102. The dedicated test database had zero schemas matching the generated UI prefix. Compose showed only PostgreSQL, healthy. The next frontend/backend start is explicit through the documented npm commands.

## Limits of the evidence

2026-10-22 planning update: daily cadence and repeat/coverage requirements are recorded in ROADMAP, DECISIONS (D019) and PHASE_3_HANDOVER. Reviewed existing persistence and ingestion code plus integration test cases for exact identity, unchanged observations, snapshots and page-limit outcomes. No application code, database contents or active schedules changed. Build, lint, typecheck, unit, PostgreSQL integration and browser suites were not rerun for this documentation-only update; the earlier pass counts remain historical. No daily scheduler, briefing-history behavior or completeness guarantee is verified by this update.

Windows/Node 24.3.0 and PostgreSQL 18.6 were exercised. Linux/macOS, API/worker container images, CI, authentication, real-employer coverage, and geography precision/recall on a labeled real-job corpus were not tested. The narrow classifier is a versioned source-text signal, not an overall eligibility or visa assessment. No automatic closure, fuzzy merges, or later-phase features were implemented.
