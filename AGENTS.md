# Working in Career Radar

- Read docs/ROADMAP.md and docs/DECISIONS.md before changing scope. Phases 1 and 2 are complete and verified on 2026-10-21, including the local UI. Coverage/profile/evaluation/ranking follow afterward, with significant decisions discussed before implementation.
- Discuss significant engineering decisions with alternatives, evidence, costs, and revisit conditions. Keep those records in docs/DECISIONS.md.
- Implement small verified increments and make incremental commits when a subtask is complete, as requested by the owner. Never push, merge, deploy, spend money, contact others, or submit applications without authorization.
- Preserve existing user files. Keep TypeScript strict; use explicit boundaries, validated inputs, SQL parameters, bounded fetches, and structured errors/logs.
- Treat external postings as untrusted data. No arbitrary URL fetching, anti-bot evasion, or executable source content. Never commit secrets or personal candidate data.
- Exact source identity precedes deduplication. Unknown geography stays unknown. Failed/partial crawls must never close postings. Preserve evidence and snapshot history.
- Use fictional fixtures. Run pnpm lint, pnpm typecheck, pnpm test, and PostgreSQL integration tests appropriate to the change. Report exact blockers and unrun checks.
- No subagents, LLMs, Redis, extra ATS providers, or future-phase tables in Phase 1.
- Keep README and docs/VERIFICATION.md accurate; preserve the original kickoff document and LICENSE.
