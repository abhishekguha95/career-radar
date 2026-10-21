# Engineering decisions

Plan approved 2026-10-21. Record changes here with supporting evidence; do not treat tool preferences as permanent constraints.

| Decision | Choice and rationale | Alternative / revisit condition |
| --- | --- | --- |
| D001: boundaries | TypeScript modular monolith; NestJS API and separate CLI share modules. Explicit validation and DI; ingestion does not block HTTP requests. | Fastify alone is smaller; Next.js route handlers reduce app count. Revisit if Nest ceremony outweighs module/testing value. |
| D002: services | PostgreSQL only; source-scoped database locking serializes runs. No persistent scheduler in Phase 1. | Redis/BullMQ when durable queued scheduling, independent workers, or retry coordination is actually needed. |
| D003: provider | Original TypeScript Lever adapter. Official [docs](https://github.com/lever/postings-api) permit third-party scraping of published posts and expose pagination, workplace type, commitment, and posting/apply URLs. | Greenhouse provides richer source dates/identities. Revisit based on target-employer coverage. Python reuse adds runtime and integration work for one simple API. |
| D004: storage | PostgreSQL 18 supported stable line; pg and stable node-pg-migrate. Parameterized SQL exposes constraints, locking and transaction behavior. | Drizzle/Prisma provide stronger inferred/generated query types. Revisit as query volume grows; SQL requires integration tests and explicit row mapping. |
| D005: identity/history | Unique source + external ID. Initially one opportunity per posting. Append snapshots when source content changes; observation timestamps are separate. | No fuzzy merges until a review workflow and evidence exist. No auto-closure from missing posts in Phase 1. |
| D006: geography | Narrow versioned INDIA_REMOTE signal; conflicting or vague evidence means UNKNOWN. Evidence refers to an immutable snapshot. | No overall application or visa verdict. Expand only against reviewed examples and false-positive measurements. |
| D007: UI | Deferred until ingestion/API correctness; README and API examples are the initial demo. | Add a small Next.js client only if it materially helps review and remains low complexity. |
| D008: license | Preserve existing MIT license for original work. No upstream source copied. | Each future reuse needs file-specific license/dependency and notice review. Dorker currently has conflicting README/license statements. |
| D009: tool versions | Pin npm-verified compatible releases and commit pnpm lockfile. TypeScript 6.0.3 instead of latest 7.0.2: typescript-eslint 8.72.0 requires TypeScript <6.1.0. Node 24 is the runtime target. | Upgrade after peer-range checks and regression tests, rather than selecting latest versions independently. |
| D010: local execution | Owner clarified 2026-10-21: Compose runs PostgreSQL only; API and ingestion JavaScript run on the host during local development. | Containerize API/worker later. Redis is a future addition when queued work justifies it. No API/worker Dockerfiles in Phase 1. |

Runtime/peer metadata was queried from npm on 2026-10-21: pnpm 12.14.0; NestJS 12.2.0 (Node >=20); pg 8.23.1; node-pg-migrate 9.0.0 (Node >=20.11); Zod 4.6.7; Vitest 5.0.5 (supports Node 24); ESLint 10.13.0 and typescript-eslint 8.72.0. The local Node 24.3.0 satisfies these ranges. Install/build verification is recorded separately.
