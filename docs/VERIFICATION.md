# Verification evidence

Record only commands actually run and observed results. Phase 1 implementation is in progress; completion is not yet claimed.

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

The initial TypeScript 6 build required an explicit `types: ["node"]` configuration; corrected and all checks rerun. Fictional fixture pages and source observations are deterministic. Database persistence is not yet implemented or claimed.

## Increment 3: PostgreSQL persistence

`build`, `typecheck`, and `lint` passed. `test:integration`: **10 tests in 1 file**, against PostgreSQL 18.6. Every suite creates a random schema in a dedicated database whose name must end in `_test`; teardown drops only that generated schema.

Verified empty-schema migration and no-op replay; fixture/live source isolation; source locks; concurrent idempotency with no orphan opportunities; A -> B -> A change history; freshness without extra snapshots; sorted-JSON hashing; old-content rejection; transaction rollback; mismatched source/run rejection; abandoned-run recovery.

`db:migrate`: applied the initial migration to the local development database. Integration tests use a separate `career_radar_test` database. No pre-existing development data was removed.
