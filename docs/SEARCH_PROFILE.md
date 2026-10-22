# Private search configuration

The operator's private file is `.local/search-profile.json`. The entire root `.local/` directory is ignored by Git. Personal candidate details must not be copied into committed examples, docs, fixtures or application logs. The committed [example](../fixtures/profiles/example.json) is fictional and deliberately uses a different candidate, experience, skills and location preferences.

Validate a local file with:

```powershell
npm run profile:validate
# Or validate the fictional example:
npm run profile:validate -- fixtures/profiles/example.json
```

The command builds the pinned contracts/core workspaces, then performs bounded local file reading and runtime validation. It makes no external requests and needs no database connection. It prints only validation status, schema version, content version, review status and the fact that no scheduler is active. Errors contain a generic message and code, without profile values, parser excerpts or the local file path.

## Layout

| Section | Meaning |
| --- | --- |
| `candidate` | User-stated location, approximate total experience, production ownership/capabilities, shared skill levels and explicit unknowns. User-stated information is not verified documentary evidence. No per-skill experience years are inferred. |
| `sharedSearch` | Target roles, selective stretch roles, preferred sectors/company traits, deprioritized requirements and qualitative ranking priorities. Empty named employers means unspecified, not a closed or empty source list. No numeric ranking weights are defined. |
| `tracks.indiaGlobalRemote` | India location preference order, preferred/exceptional cities, role-specific India employment evidence and exclusion of European relocation. An Indian entity or EOR's existence alone does not establish that a particular role can hire from India. |
| `tracks.europeRelocation` | Ordered country tiers, European employment/work-model goals, language evidence, independent authorization/sponsorship/relocation evidence requirements and Thursday accountability. Country order within a tier does not imply a finer priority. |
| `scheduleIntent` | Daily morning cadence and time zone. `localTime: null` means no exact time selected. It does not create an operating-system task or start an application scheduler. |
| `briefing` | Result cap, preferred freshness lookback, evidence labels, requested fields, compensation disclosure and closing recommendations. The lookback range describes a preferred recent-search window, not a minimum posting age or an exclusion of newer, older or undated live roles. |
| `historyIntent` | Reobservation, eventual suppression of unchanged reported repeats, preservation of unreported candidates and resurfacing after material changes. This is a requirement, not implemented briefing-history storage. |
| `review` | New files start `DRAFT` with no review timestamp. An explicit owner review can set `REVIEWED` together with an ISO timestamp. Validation alone never changes review status. |

Unknown values use null, UNKNOWN or an empty authorization list; an empty list establishes no rights. Residence must not establish citizenship or work authorization. Developing and learning/portfolio skills remain separate from strong production experience. The schema rejects the same skill in multiple groups, duplicate country priorities, repeated authorization countries, contradictory review metadata, unknown fields and unsupported track boundaries.

The [schema](../packages/contracts/src/search-profile.ts) is strict and versioned. The [loader](../packages/core/src/search-profile.ts) caps reads at 128 KiB and returns a SHA-256 content version over validated, canonical JSON. Object key order does not change that version; content and ordered preferences do. Keep the returned profile in memory only where needed; never log the returned candidate object. Only the generic schema, loader, command and fictional examples/tests are committed.

## Where it enters the flow

Implemented now: local configuration creation, validation and reproducible profile versioning. The ingestion CLI and read-only API do not load it, so collecting or refreshing jobs does not apply candidate filters. Editing the profile does not mutate postings or inferred job attributes.

Planned flow: configured feeds -> validated stored postings/snapshots -> shared role/skill assessment -> track-specific eligibility evidence -> explained ranking and briefing. A future assessment should identify its posting snapshot, profile version and matcher version. Profile changes can then trigger reassessment of stored postings without recollection or duplicate postings. Review eligibility cases, component behavior and evaluation labels before implementing that matcher. Database persistence, a combined real-search view, ranking, application history and daily execution remain separate work.
