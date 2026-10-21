# Roadmap and current state

Phase 1 plan approved 2026-10-21. Work proceeds in independently verified commits. Decisions remain open to challenge with evidence.

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| 1 | Lever ingestion, fictional offline fixtures, PostgreSQL, history, geography signal, API | Repeatable fixture ingestion; no duplicate postings; changes retained; partial failures isolated; API filters/pagination/provenance; meaningful tests; exact setup and verification |
| 2 | Local job-browsing UI, source status, geography evidence and history | Working responsive Next.js UI backed by the API; filters/pagination/details; clear sample/live data; empty/error/loading states; simple npm startup commands |
| 3 | Target-employer coverage, candidate profile, labeled examples and baseline ranking | Coverage research drives connectors; reviewed evaluation set; eligibility separate from technical/career fit; explainable shortlist |
| 3b | Save/reject feedback and dedup review | Useful feedback workflow; merges require review; measured freshness |
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

Current state: **Phase 1 complete and verified**, 2026-10-21. Fresh-source install/build/migrations, 51 unit tests, 42 PostgreSQL integration tests, deterministic replays, compiled API queries, and a bounded live read passed. See VERIFICATION.md for evidence and limitations. **Phase 2 UI is now approved and in progress**, superseding the earlier ordering. Compose still runs PostgreSQL only; application processes run on the host.

## Phase 2 increments
1. Record revised scope and frontend/API boundary decisions.
2. Add typed read contracts and a read-only source-status endpoint; verify with PostgreSQL contract tests.
3. Build the local Next.js dashboard, job inspector, sources view, responsive states, and npm startup aliases.
4. Verify browser flows, production build, existing checks and startup commands; document results and commit.

After the UI: proceed to employer coverage research, profile requirements, a reviewed real-posting evaluation set, and baseline-ranking design. Discuss significant decisions before implementing the next phase. No paid APIs, automatic applications, publishing, extra infrastructure or fabricated fit scores are included in Phase 2. No remote branch has been pushed or deployed.
