# Verification evidence

Phase 1 acceptance verified on 2026-10-21. Evidence below records checks actually run, including initial failures and their fixes. Increment counts describe the suite at that point; final totals are 51 unit tests and 42 PostgreSQL integration tests.

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

## Limits of the evidence

Windows/Node 24.3.0 and PostgreSQL 18.6 were exercised. Linux/macOS, API/worker container images, CI, authentication, real-employer coverage, and geography precision/recall on a labeled real-job corpus were not tested. The narrow classifier is a versioned source-text signal, not an overall eligibility or visa assessment. No automatic closure, fuzzy merges, or later-phase features were implemented.
