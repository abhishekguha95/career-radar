# Roadmap and current state

Phase 1 plan approved 2026-10-21. Work proceeds in independently verified commits. Decisions remain open to challenge with evidence.

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| 1 | Lever ingestion, fictional offline fixtures, PostgreSQL, history, geography signal, API | Repeatable fixture ingestion; no duplicate postings; changes retained; partial failures isolated; API filters/pagination/provenance; meaningful tests; exact setup and verification |
| 2 | Candidate profile, search tracks, explainable baseline ranking | Labeled evaluation; eligibility separated from fit; preferences configurable |
| 3 | Dashboard, save/reject feedback, dedup review, source coverage | Useful search workflow; merges require review; measured freshness |
| 4 | Optional hybrid retrieval and structured LLM reasoning | Demonstrated benchmark improvement; recorded cost/latency; no mandatory paid provider |
| 5 | Application events and evidence-backed document drafts | Every generated claim traces to approved candidate evidence; human approval retained |
| 6 | Deployment and operational hardening | Reviewed security, monitoring, backups, source-health and cost controls |

## Phase 1 increments
1. Workspace, local PostgreSQL, contracts, and project memory.
2. Lever adapter, normalization, bounded fetching, fictional fixtures, and unit tests.
3. Migrations, posting persistence, snapshots, and real PostgreSQL tests.
4. Ingestion CLI, run completeness, locking, failure isolation, and replay tests.
5. Narrow India-remote geography signal, read-only API, contract tests.
6. Clean developer-journey verification and completed documentation.

Current state: **Phase 1 complete and verified**, 2026-10-21. Fresh-source install/build/migrations, 51 unit tests, 42 PostgreSQL integration tests, deterministic replays, compiled API queries, and a bounded live read passed. See VERIFICATION.md for evidence and limitations. The API is the Phase 1 demo; UI is deferred. Compose runs PostgreSQL only; API/worker containers and Redis are deferred per owner clarification.

Next: review the Phase 1 code/decisions and discuss Phase 2's candidate-profile and baseline-ranking plan, including target-employer coverage and a labeled geography benchmark. **Do not implement Phase 2 before approval.** No remote branch has been pushed or deployed.
