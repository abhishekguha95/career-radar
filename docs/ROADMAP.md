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

Current state: **Phases 1 and 2 complete and verified**, 2026-10-21. Phase 1 established ingestion and its fresh-source acceptance. Phase 2 adds responsive job browsing, filters, details, evidence/history, source status and npm startup commands. Current checks: production build, strict type checks, lint, 59 unit tests, 43 PostgreSQL integration tests and 8 desktop/mobile browser tests passed. A separate production-server check verified backend-unavailable recovery. See VERIFICATION.md for evidence and limitations. Compose still runs PostgreSQL only; application processes run on the host.

## Phase 2 increments
1. Record revised scope and frontend/API boundary decisions.
2. Add typed read contracts and a read-only source-status endpoint; verify with PostgreSQL contract tests.
3. Build the local Next.js dashboard, job inspector, sources view, responsive states, and npm startup aliases.
4. Verify browser flows, production build, existing checks and startup commands; document results and commit.

All four increments are complete. Local commits: `1fbdf94` records the scope, `991b051` adds the typed read/source boundary, and `6b7172d` adds the UI and its verification. The final documentation increment updates this roadmap, the README, architecture and Hello Interview walkthrough. Temporary UI servers were stopped and generated UI-test schemas removed; PostgreSQL remains healthy. Start the app with `npm run backend` and `npm run frontend` in separate terminals.

After the UI: proceed to employer coverage research, profile requirements, a reviewed real-posting evaluation set, and baseline-ranking design. See [Phase 3 handover](PHASE_3_HANDOVER.md) for current state, demo-data caveats, proposed increments and decisions to discuss before implementation. No paid APIs, automatic applications, publishing, extra infrastructure or fabricated fit scores are included in Phase 2. No remote branch has been pushed or deployed.

## Phase 3 daily search requirements

Phase 3A progress, 2026-10-22: the [employer coverage pilot](EMPLOYER_COVERAGE.md) establishes three verified Greenhouse boards, one Lever board, one unsupported Ashby board and three unresolved integrations. D020's Greenhouse adapter, shared transport, provider contracts, CLI selection and third migration are implemented. The local database now retains 371 employer postings from Grafana, Razorpay and Wolt; repeat collections created zero additional postings or snapshots. Existing 13 sample/provider-demo records remain intact. See VERIFICATION for current checks. Employer feeds and preliminary track relevance are not an eligibility verdict or ranked shortlist.

Next bounded work: review a private profile/search-track format and independent eligibility/evidence contracts using actual postings, and agree combined real-search/demo separation. Complete that review before ranking or new eligibility rules. Ashby, source discovery, daily scheduling and briefing-history implementation remain pending; the daily requirement below is not an active trigger.

Owner update, 2026-10-22 (Asia/Kolkata): both **India & Global Remote** and **Europe Relocation** should run every morning, replacing the earlier Tuesday/Friday and Monday/Thursday schedules. They remain separate search tracks. Thursday's Europe accountability check remains Thursday-only. Exact time and scheduler mechanism are pending; no daily trigger is configured by this documentation change. Candidate facts and detailed personal profile configuration stay out of Git.

Daily collection and daily presentation have distinct requirements:

- Enumerate configured employer feeds with provider-appropriate pagination and bounded requests. Do not stop collection after finding ten matches or restrict discovery to a posting-date window. Missing or unreliable posting dates stay unknown; first observation is not an original posting date.
- Reobserve existing postings. Exact source + external posting ID identifies the stored posting; unchanged sightings refresh observation metadata, while changed content retains snapshot history. A similar title is insufficient to merge postings from different sources or different external IDs.
- Preserve all collected postings independently of each track's up-to-ten briefing limit. A role omitted from a briefing must remain eligible for subsequent consideration while relevant and available. Previously seen or reported roles may need reassessment after material posting changes, new eligibility evidence or a reviewed profile change. Repeat-suppression and presentation-history storage require their own reviewed implementation; they do not yet exist.
- Report run completeness, failures, page caps and rejected records. Retry incomplete coverage in subsequent runs using a provider-appropriate strategy; repeated partial runs must remain a visible coverage gap. Failed or partial crawls must never close missing jobs or advance a discovery checkpoint past unprocessed results.
- Use freshness as a ranking preference, not a blanket exclusion of older or undated live roles. Keep new-to-source, newly observed and materially updated meanings separate. Never describe an unchanged repeat sighting as a newly posted vacancy.

Daily polling reduces discovery delay but cannot guarantee every public vacancy is captured. Unsupported employers, source failures, incomplete enumeration, search indexing gaps and roles published and removed between polls remain possible misses. Coverage should be measured against the reviewed employer set, with gaps reported explicitly.

The smallest next implementation remains verified employer coverage and demonstration separation. Scheduling now belongs in the Phase 3 plan, after a repeatable collection path exists. Compare a local OS scheduler invoking the CLI (no extra service, dependent on host availability) with an application scheduler (requires a continuously running process and restart/recovery handling) before choosing. The cadence change does not authorize Redis/BullMQ, deployment, external delivery or new adapters by implication.

Acceptance cases for the eventual implementation: identical daily runs create no duplicate postings; a changed posting preserves its ID and adds history; an undated posting is discoverable; a relevant eleventh role remains available after a ten-role briefing; an already collected but unreported role remains eligible; meaningful changes can resurface a role with a clear reason; partial collection cannot claim complete coverage; both track boundaries and demo exclusions remain intact. Test scheduler recovery after missed or overlapping runs once the scheduler mechanism is selected.
