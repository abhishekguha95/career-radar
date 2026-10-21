import type { EligibilitySignal, JobsQuery, NormalizedJob, Provenance } from '@career-radar/contracts';
import type { Pool, PoolClient } from 'pg';

interface JobRow<T> {
  id: string;
  opportunity_id: string;
  normalized: T;
  first_seen_at: Date;
  last_seen_at: Date;
  external_status: string;
  last_provenance: Provenance;
  source: { id: string; provider: string; region: string; site: string; mode: string; health: string; lastSuccessfulRunAt: string | null };
  run: { id: string; status: string; complete: boolean; startedAt: string; finishedAt: string | null };
  assessment: EligibilitySignal | null;
}

const joins = `FROM job_postings p
  JOIN job_sources s ON s.id=p.source_id
  JOIN ingestion_runs r ON r.id=p.last_run_id
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object('context',e.context,'result',e.result,'reasonCodes',e.reason_codes,
      'evidence',e.evidence,'classifierVersion',e.classifier_version,'disclaimer',e.disclaimer) AS signal
    FROM eligibility_assessments e WHERE e.snapshot_id=p.current_snapshot_id
    ORDER BY e.checked_at DESC,e.classifier_version DESC LIMIT 1
  ) a ON true`;

const columns = `p.id,p.opportunity_id,p.first_seen_at,p.last_seen_at,p.external_status,p.last_provenance,
  jsonb_build_object('id',s.id,'provider',s.provider,'region',s.region,'site',s.site,'mode',s.mode,
    'health',s.health,'lastSuccessfulRunAt',s.last_success_at) AS source,
  jsonb_build_object('id',r.id,'status',r.status,'complete',r.complete,'startedAt',r.started_at,'finishedAt',r.finished_at) AS run,
  a.signal AS assessment`;

function present<T>(row: JobRow<T>) {
  return {
    ...row.normalized,
    id: row.id,
    opportunityId: row.opportunity_id,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    externalStatus: row.external_status,
    source: row.source,
    latestRun: row.run,
    eligibility: row.assessment,
  };
}

async function readTransaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

function literalPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

export class JobsReader {
  constructor(private readonly pool: Pool) {}

  async list(query: JobsQuery) {
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (value: unknown) => { values.push(value); return `$${values.length}`; };
    if (query.title) conditions.push(`p.title ILIKE ${add(literalPattern(query.title))}`);
    if (query.source) conditions.push(`p.source_id=${add(query.source)}`);
    if (query.location) {
      const parameter = add(literalPattern(query.location));
      conditions.push(`(p.location ILIKE ${parameter} OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p.normalized->'allLocations') loc(value) WHERE loc.value ILIKE ${parameter}))`);
    }
    if (query.observedSince) conditions.push(`p.last_seen_at >= ${add(query.observedSince)}::timestamptz`);
    if (query.workplace) conditions.push(`p.workplace=${add(query.workplace)}`);
    if (query.mode) conditions.push(`s.mode=${add(query.mode)}`);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return readTransaction(this.pool, async (client) => {
      const count = await client.query<{ total: string }>(`SELECT count(*) AS total FROM job_postings p JOIN job_sources s ON s.id=p.source_id ${where}`, values);
      const total = Number(count.rows[0]!.total);
      const rows = await client.query<JobRow<Omit<NormalizedJob, 'description'>>>(`
        SELECT ${columns},p.normalized - 'description' AS normalized ${joins} ${where}
        ORDER BY p.last_seen_at DESC,p.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.limit, (query.page - 1) * query.limit]);
      return {
        data: rows.rows.map(present),
        pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit), hasNext: query.page * query.limit < total },
      };
    });
  }

  async get(id: string) {
    return readTransaction(this.pool, async (client) => {
      const result = await client.query<JobRow<NormalizedJob>>(`SELECT ${columns},p.normalized ${joins} WHERE p.id=$1`, [id]);
      const row = result.rows[0];
      if (!row) return null;
      const snapshot = (await client.query<{ id: string; revision: number; raw: Record<string, unknown>; provenance: Provenance; content_hash: string; recorded_at: Date }>(`
        SELECT s.id,s.revision,s.raw,s.provenance,s.content_hash,s.recorded_at
        FROM job_snapshots s JOIN job_postings p ON p.current_snapshot_id=s.id WHERE p.id=$1`, [id])).rows[0]!;
      const history = await client.query<{ id: string; revision: number; title: string; observed_at: Date; mapping_version: string; content_hash: string }>(`
        SELECT id,revision,normalized->>'title' AS title,observed_at,mapping_version,content_hash
        FROM job_snapshots WHERE posting_id=$1 ORDER BY revision DESC LIMIT 20`, [id]);
      return {
        ...present(row),
        provenance: {
          latestObservation: row.last_provenance,
          currentSnapshot: {
            id: snapshot.id, revision: snapshot.revision, raw: snapshot.raw, ...snapshot.provenance,
            contentHash: snapshot.content_hash, recordedAt: snapshot.recorded_at.toISOString(),
          },
          history: {
            total: snapshot.revision,
            hasMore: snapshot.revision > history.rows.length,
            data: history.rows.map((item) => ({ id: item.id, revision: item.revision, title: item.title, observedAt: item.observed_at.toISOString(), mappingVersion: item.mapping_version, contentHash: item.content_hash })),
          },
        },
      };
    });
  }
}
