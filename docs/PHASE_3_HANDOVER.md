# Phase 3 implementation handover

Prepared 2026-10-21 against completed application revision `359092e`. Phases 1 and 2 are implemented and verified. This document is a proposed next-phase plan and continuity record; it does not record approval of new connectors, schemas, eligibility rules or ranking weights.

## Start here

The next useful outcome is **a small set of actual target-employer postings, followed by an explainable shortlist for an explicitly reviewed search profile**. Establish useful coverage before building matching sophistication.

Read [AGENTS.md](../AGENTS.md), [ROADMAP.md](ROADMAP.md) and [DECISIONS.md](DECISIONS.md) first. Use [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md) for goals, [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) for the Hello Interview walkthrough, [README.md](../README.md) for commands, and [VERIFICATION.md](VERIFICATION.md) for evidence. Preserve the original [kickoff](CAREER_RADAR_CODEX_KICKOFF.md); the owner's later sequencing in ROADMAP supersedes its original phase numbers.

The owner wants phased implementation, discussion and challenge of consequential engineering choices, solid evidence for decisions, and an incremental commit after each verified subtask. Present the next bounded implementation plan before changing application code. Prepare concrete alternatives and tradeoffs; avoid asking for repeated approval of routine work already authorized.

## What exists

| Area | Implemented behavior |
| --- | --- |
| Runtime | Strict TypeScript pnpm workspace. Host processes for Next.js, NestJS and ingestion. Docker Compose runs PostgreSQL only. |
| Ingestion | Original Lever adapter for configured global/EU sites; fictional fixture adapter; explicit CLI collection. Bounded GET requests, pacing, retries, cancellation, per-source locking and run outcomes. |
| Persistence | Six tables: sources, runs, opportunities, postings, snapshots and eligibility assessments. Exact source/posting identity, per-posting transactions and preserved change history. |
| Geography | Versioned `INDIA_REMOTE` source-text signal with ELIGIBLE / INELIGIBLE / UNKNOWN and evidence. No sponsorship, visa or overall application verdict. |
| API | Read-only `GET /health`, `/ready`, `/sources`, `/jobs`, `/jobs/:id`; validated filters, pagination, response contracts and sanitized errors. |
| UI | Responsive browsing, URL filters/selection, pagination, descriptions, geography evidence, history, source status and local recovery states. Server-side API reads; no direct database access. |
| Missing | Target-employer coverage study, real candidate profile, ranking, evaluation corpus, save/reject workflow, additional ATS adapters, scheduler and applications. |

Communication remains: browser → Next.js → NestJS → PostgreSQL. The ingestion CLI writes PostgreSQL separately and calls the external ATS directly. Refreshing the UI reads stored state; it does not crawl employers.

## Critical context: the current jobs are demonstration data

The owner asked why Lever Demo was visible and whether those were actual openings. Carry this distinction into the next implementation:

| Data | Origin | Meaning |
| --- | --- | --- |
| Sample data | `fixtures/lever/baseline.json`, mode FIXTURE | Three fictional jobs across two simulated pages; deterministic tests and local demos. |
| Provider demo | Public Lever `leverdemo` site, mode LIVE | Ten records collected during a bounded connector verification. Real network responses, but not verified employer vacancies. |
| Employer source | An employer's verified public careers feed | The desired next input. Collection still does not guarantee the vacancy remains open or that the candidate qualifies. |

At the last verification, the development database held the three baseline fixtures and ten provider-demo records. Reinspect current state; local data and running processes may have changed since this handover. No target-employer feed was imported as part of completed acceptance.

**LIVE means collection mode, not verified vacancy authenticity.** The UI labels `leverdemo` as Provider demo, but its Live collections filter includes that source. Workspace metrics include samples and demos too. The label currently comes from a frontend site-name check in `sourceLabel`; there is no general source-purpose classification in the API/schema.

Agree how a real-search view excludes demonstrations while retaining an explicit demo experience. Consider a curated source selection first; compare it with a shared source-purpose contract if classification needs to apply across the API, counts and ranking. Test list, counts, sources and shortlist consistently. Do not silently delete demo data or redefine FIXTURE/LIVE to mean authenticity.

## Resume the local environment

Run from `F:\GITHUB\career-radar` with Node 24 and Docker Desktop running. Versions are pinned in manifests and the lockfile; npm scripts bootstrap pnpm without a global install.

```powershell
if (-not (Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
npm run setup
npm run db:start
npm run db:migrate
```

Use separate terminals for `npm run backend` and `npm run frontend`. API: `http://127.0.0.1:3001`; UI: `http://127.0.0.1:3000`; PostgreSQL host port: 54329. At the end of Phase 2, temporary app servers were stopped and PostgreSQL remained healthy; confirm rather than assuming.

`npm run demo` is optional fictional data loading. It is not real-job discovery. Build ingestion with `npm run build` before using `npm run ingest -- --help` in a fresh checkout. Live collection accepts `--site`, `--employer`, `--region`, `--max-pages` and `--page-size`; use an independently verified employer/site, not `leverdemo`, for the pilot. No new live collection is performed by this handover.

A full page at the page cap means incomplete enumeration, not success with all jobs found. CLI exit codes are 0 success, 2 partial, 1 failure and 130 interrupted; nested pnpm can translate failures to 1. Use `node apps/ingest/dist/main.js ...` when the precise code matters.

## Proposed implementation increments

### 3A. Employer coverage and a useful real-data view

Agree a small target list with the owner; an initial 5–10 employers is a proposal, not a quota or an established list. Start from their official careers pages and verify each provider, site/board identifier and region. Do not guess identifiers from company names.

Record employer, official careers URL, provider/site, search-track relevance, verification date, access documentation, collection outcome and gaps in a coverage report. Distinguish a valid empty feed, unsupported provider, failed request and incomplete crawl. Research itself can proceed before choosing a new connector; verify current official documentation before relying on access or fields.

Pilot the existing Lever connector where target coverage supports it. If coverage is weak, present evidence for another adapter rather than selecting employers merely because they use Lever. Review that adapter's contracts, identity semantics, timestamps, limits and terms before implementation. The shared contracts currently constrain the provider to LEVER, so another connector requires a coordinated change rather than only another fetch function.

Exit evidence: actual postings from verified employer feeds appear with provenance and source/run status; repeat collection is idempotent; any partial result is explicit; sample/provider-demo records are distinguishable and excluded from the agreed real-search view. Record excluded demonstration counts separately where useful. If no relevant openings are found, report that result and the coverage gap without substituting demo jobs.

Commit the coverage findings and each independently verified implementation increment. Do not commit collected raw postings by default; review redistribution before adding real text as repository data.

### 3B. Candidate profile and search-track contract

Review the owner's target employers, role/seniority preferences, hard requirements, preferred growth areas, remote arrangement and relocation priorities. Existing PRODUCT_BRIEF is starting context, not a complete verified profile. Missing preferences, compensation expectations and authorization facts stay unknown.

Keep candidate evidence, search preferences and inferred job attributes distinct. Define how the profile is versioned and validated. Compare an ignored local configuration file with database-backed storage: the first may keep a single-user pilot small; the second supports editing/history but adds migrations and write APIs. Select storage from the required workflow, not a predetermined table list. Use fictional profiles in committed examples/tests; keep personal facts out of Git and logs.

Exit evidence: a validated, owner-reviewed search configuration with explicit unknowns and a repeatable version identifier. Any persistence/API changes need their own tests and decision record.

### 3C. Reviewed evaluation examples and eligibility boundaries

Before tuning ranking, create a small reviewed corpus from the pilot: useful matches, plausible but poor matches, clear blockers, vague remote claims, relocation-only wording, missing information and stretch roles. Agree corpus size and label definitions. Preserve the posting version, source, observation time, label rationale, review status and profile version; keep tuning and held-out examples separate where feasible.

Label geography/authorization evidence separately from technical fit, career fit and recommendation. Use the owner as reviewer for subjective preference labels. Do not convert an uncertain label into ground truth just to make a benchmark complete.

The current classifier only assesses working remotely from India. Do not apply its negative result to Europe-relocation suitability: a US-residence restriction, India-remote permission and EU sponsorship are different questions. Review the next assessment contexts and contradictory/unknown cases before adding rules. Relocation support alone does not establish sponsorship. Known hard blockers cannot be offset by a high skill score; unknowns must remain visibly pending verification rather than being silently treated as allowed or blocked.

Exit evidence: reviewed labels and an agreed evaluation protocol before score tuning; every consequential eligibility claim traces to a preserved source passage and rule version. A small corpus establishes a baseline, not broad accuracy.

### 3D. Deterministic baseline ranking

Review a transparent baseline using explicit skills/aliases, role/seniority evidence and stated career preferences. Title/description matching can supply candidate signals, but skill mentions must not manufacture years of experience or scope of ownership. Start with existing queries and a simple bounded scoring pass if adequate; justify full-text indexes or retrieval changes with measured needs.

Keep eligibility, technical fit, career fit and recommendation separate in contracts and UI. Discuss whether uncertain roles sit in a pending-verification group, and how stretch roles are presented. Review component weights, missing-value behavior and tie-breaking using the labeled examples; do not choose arbitrary percentages and call them calibrated confidence.

For reproducibility, associate outputs with posting snapshot, profile version, matcher version and configuration. Explain matched/missing requirements, contributing evidence, uncertainty and reasons to apply/reject. Compare recomputing on read with persisted assessments using actual latency/history needs; do not prescribe a cache or table prematurely.

Exit evidence: deterministic results on fixed inputs; visible explanations; blockers survive ranking; sample/provider-demo records cannot enter the real shortlist; reviewed held-out results reported with sample size, precision@10 when enough labeled results exist, false eligibility-positive counts, unknown coverage and evaluation latency. Agree quality thresholds before tuning. Scores are ranking aids, not hiring probabilities.

### 3E. UI integration and end-to-end acceptance

Extend the existing dashboard with the reviewed profile/search-track and recommendation behavior. Preserve source links, dates, evidence/history, clear data labels, URL browsing state and useful empty/error states. Introduce only the controls backed by implemented APIs. Save/reject actions remain Phase 3b unless the owner changes scope.

Exit evidence: an operator can collect configured employer jobs, open a real-search view, review recommendations for the chosen profile, identify blockers/unknowns and inspect the exact supporting posting version. Exercise desktop/mobile flows and the documented startup path; update README, architecture, decisions, roadmap and verification. Commit after each completed subtask.

## Decisions to discuss before dependent implementation

| Decision | Options/evidence to bring to the discussion |
| --- | --- |
| First search track and employer set | Remote India first versus parallel relocation; owner priorities and observed feed coverage. |
| Provider expansion | Existing Lever versus one additional adapter; target coverage and verified access/field semantics. |
| Demonstration separation | Curated source selection versus explicit source-purpose contract; consistent API/UI/count/ranking behavior. |
| Profile storage/editing | Private versioned file versus PostgreSQL/write API; actual editing, privacy and history requirements. |
| Eligibility contexts | Current INDIA_REMOTE signal versus additional independent checks; reviewed examples, uncertainty and evidence. |
| Ranking contract | Separate components, missing-value treatment, weights and pending/blocked/stretch presentation; labeled cases. |
| Assessment lifecycle | Compute when requested versus persist versioned outputs; measured latency, reproducibility and history needs. |

Record the chosen option, rejected alternatives, evidence, cost/complexity and revisit condition in DECISIONS. New API routes, fields, tables, thresholds and weights are proposals until reviewed; their existence is not implied by this handover.

## Code map and invariants

| Starting point | Relevance to Phase 3 |
| --- | --- |
| `packages/contracts/src/index.ts` | Source/provider constraints, normalization types, INDIA_REMOTE context and runtime API response schemas. |
| `packages/core/src/adapter.ts`, `lever.ts`, `fixture.ts` | Adapter boundary, bounded network behavior, mapping and deterministic inputs. |
| `packages/core/src/ingestion.ts`, `eligibility.ts` | Run outcomes and narrow evidence-based geography rules. |
| `packages/database/src/repository.ts`, `queries.ts` | Identity, locks, transaction boundaries, snapshots and API reads. |
| `packages/database/migrations/` | Two existing migrations; use a new migration for schema changes. |
| `apps/ingest/src/main.ts` | Explicit collection entry point and mode selection. |
| `apps/api/src/app.ts` | Current read routes, service wiring and HTTP validation/errors. |
| `apps/web/src/lib/api.server.ts`, `presentation.ts` | Server-side API reads, URL parsing and demo/source labels. |
| `apps/web/src/app/`, `apps/web/src/components/` | Dashboard, sources, guide, filters and evidence/history inspector. |
| `tests/`, `scripts/test-ui.mjs` | Existing unit, isolated PostgreSQL and desktop/mobile acceptance checks. |

Preserve these invariants:

- Source identity is provider + region + site + mode; posting identity is source ID + external ID. Opportunity/posting separation remains; no speculative fuzzy merges.
- Changed content appends a snapshot. Unchanged observations update freshness without new content versions; older different content cannot replace newer state. Application-level append-only history does not imply administrator-proof immutability.
- Failed/partial or smaller crawls never automatically close missing jobs. Last observed PUBLISHED is not proof of current availability.
- Unknown remains unknown. Source text is untrusted data and renders as text; it must never direct tools or execute as markup.
- The frontend reads validated API contracts; it does not import database repositories. API reads do not trigger ingestion.
- Read consistency is per API response; separate dashboard requests and pagination pages can see different commits. History metadata is capped at the latest 20 versions.

Read applicable repository/skill instructions before editing their area. Next.js generates `apps/web/AGENTS.md`; read its installed documentation guidance before frontend changes. For database/schema/SQL work, apply the available Postgres skill before writing changes. Keep exact dependencies, strict TypeScript, the lockfile and the 24-hour dependency release-age policy. The verified TypeScript 6 version was selected for lint-tool compatibility; do not independently upgrade to latest.

## Verification and handoff discipline

Last completed baseline at `359092e`: production build, strict type checks and lint passed; **59 unit tests, 43 PostgreSQL integration tests and 8 Chrome desktop/mobile tests passed**. A separate production-server smoke check verified API-unavailable recovery. These are historical results, not checks rerun by writing this document. See VERIFICATION for initial failures/fixes and limits: no coverage benchmark, real-job geography benchmark, performance audit or full accessibility audit exists yet.

For implementation changes, run the checks appropriate to affected behavior:

```powershell
npm run build
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:ui
```

Integration/UI checks require the dedicated TEST_DATABASE_URL ending in `_test`; follow README to create it if absent. They use generated schemas, not development tables. UI tests require installed Google Chrome and free ports 3100/3101. The in-app browser previously failed to initialize with `sandboxPolicy` metadata missing; standalone Playwright/installed Chrome was the documented fallback. Retry current supported tooling normally; do not claim browser verification if it cannot run.

Add tests for new behavior rather than repeatedly rerunning unchanged suites without cause. Keep network-independent fictional fixtures for regressions and an explicitly separate bounded live check for source coverage. Report current results, failures, skipped checks and data-cleanup state. Update VERIFICATION after implementation and make reviewable local commits; do not push automatically.

Continue local/low-cost operation. Redis, BullMQ, API/worker containers, embeddings, LLMs, automated discovery at scale, applications, email, resumes and deployment remain outside this proposed phase unless separately justified and reviewed. Public-feed collection in the existing connector requires no paid API/LLM key; recheck access and costs for any proposed service. Do not spend money, publish, contact others or submit applications without explicit authorization.

## Suggested first message in the next session

> Read docs/PHASE_3_HANDOVER.md, AGENTS.md, ROADMAP.md and DECISIONS.md. Inspect the current checkout and environment without changing working data. Start Phase 3 planning with a real-employer coverage pilot and explicit sample/provider-demo separation. Present the smallest implementation increment, alternatives, evidence and acceptance checks for discussion. Do not implement profiles, new connectors or ranking until their dependent decisions have been reviewed. Make incremental commits as verified subtasks finish.
